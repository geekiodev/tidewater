-- Prompt 1: workspaces, membership, invitations, rate limiting.
--
-- Security model
-- * Every table has row-level security enabled. Access is decided in the
--   database from auth.uid(), never from IDs sent by the browser.
-- * Internal helpers and internal tables live in the `private` schema, which
--   is not exposed through the Supabase Data API.
-- * Supabase grants anon/authenticated broad default privileges on objects in
--   `public`; we revoke those and grant back only what each role needs.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create type public.workspace_role as enum ('owner', 'member');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.workspace_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id),
  -- v1 simplification: a user belongs to exactly one workspace.
  constraint workspace_members_one_workspace_per_user unique (user_id)
);

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null check (char_length(email) between 3 and 254 and email = lower(email)),
  -- Only a SHA-256 hash of the invitation token is stored.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null
);

create unique index workspace_invitations_one_open_per_email
  on public.workspace_invitations (workspace_id, email)
  where accepted_at is null;

create table private.rate_limits (
  bucket text not null check (char_length(bucket) <= 200),
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);

-- ---------------------------------------------------------------------------
-- Privileges: start from nothing, grant back the minimum.
-- ---------------------------------------------------------------------------

revoke all on public.workspaces, public.workspace_members, public.workspace_invitations
  from anon, authenticated, public;
revoke all on private.rate_limits from anon, authenticated, public;

grant select on public.workspaces to authenticated;
grant update (name) on public.workspaces to authenticated;   -- column-level: name only
grant select, delete on public.workspace_members to authenticated;
grant select, insert, delete on public.workspace_invitations to authenticated;

grant all on public.workspaces, public.workspace_members, public.workspace_invitations
  to service_role;
grant all on private.rate_limits to service_role;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invitations enable row level security;
alter table private.rate_limits enable row level security;  -- no policies: only service_role (bypasses RLS)

-- ---------------------------------------------------------------------------
-- Helper functions used by policies. SECURITY DEFINER so they can read
-- workspace_members without recursing into its own RLS policies.
-- ---------------------------------------------------------------------------

create function private.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
  );
$$;

create function private.is_workspace_owner(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  );
$$;

revoke all on function private.is_workspace_member(uuid) from public, anon;
revoke all on function private.is_workspace_owner(uuid) from public, anon;
grant execute on function private.is_workspace_member(uuid) to authenticated, service_role;
grant execute on function private.is_workspace_owner(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

create policy workspaces_select_members on public.workspaces
  for select to authenticated
  using ((select private.is_workspace_member(id)));

create policy workspaces_update_owners on public.workspaces
  for update to authenticated
  using ((select private.is_workspace_owner(id)))
  with check ((select private.is_workspace_owner(id)));

create policy members_select_same_workspace on public.workspace_members
  for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));

-- Owners can remove other members; nobody can remove themselves this way
-- (so a workspace can't be left without its owner).
create policy members_delete_by_owner on public.workspace_members
  for delete to authenticated
  using (
    (select private.is_workspace_owner(workspace_id))
    and user_id <> (select auth.uid())
  );

create policy invitations_select_owner on public.workspace_invitations
  for select to authenticated
  using ((select private.is_workspace_owner(workspace_id)));

create policy invitations_insert_owner on public.workspace_invitations
  for insert to authenticated
  with check (
    (select private.is_workspace_owner(workspace_id))
    and invited_by = (select auth.uid())
    and accepted_at is null
    and accepted_by is null
  );

create policy invitations_delete_owner on public.workspace_invitations
  for delete to authenticated
  using ((select private.is_workspace_owner(workspace_id)));

-- ---------------------------------------------------------------------------
-- Sign-up: create the user's workspace from sign-up metadata.
-- Users who sign up through an invitation pass no workspace_name and join
-- the inviting workspace by accepting the invitation instead.
-- ---------------------------------------------------------------------------

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(new.raw_user_meta_data ->> 'workspace_name', ''));
  v_workspace_id uuid;
begin
  if char_length(v_name) between 1 and 100 then
    insert into public.workspaces (name) values (v_name) returning id into v_workspace_id;
    insert into public.workspace_members (workspace_id, user_id, role)
      values (v_workspace_id, new.id, 'owner');
  end if;
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- For a signed-in user who has no workspace yet (e.g. signed up via an
-- invitation link that has since expired, or was removed from a workspace).
create function public.create_workspace(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_workspace_id uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 100 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if exists (select 1 from public.workspace_members where user_id = v_user) then
    raise exception 'already_in_workspace' using errcode = '23505';
  end if;
  insert into public.workspaces (name) values (v_name) returning id into v_workspace_id;
  insert into public.workspace_members (workspace_id, user_id, role)
    values (v_workspace_id, v_user, 'owner');
  return v_workspace_id;
end;
$$;

revoke all on function public.create_workspace(text) from public, anon;
grant execute on function public.create_workspace(text) to authenticated;

-- Accept an invitation. The caller must be signed in with a confirmed email
-- that matches the invitation. Role is always 'member'.
create function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_invite public.workspace_invitations%rowtype;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_token is null or char_length(p_token) not between 20 and 200 then
    raise exception 'invalid_invitation' using errcode = '22023';
  end if;

  select lower(u.email) into v_email
  from auth.users u
  where u.id = v_user and u.email_confirmed_at is not null;

  if v_email is null then
    raise exception 'email_not_confirmed' using errcode = '42501';
  end if;

  select * into v_invite
  from public.workspace_invitations i
  where i.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
    and i.accepted_at is null
    and i.expires_at > now()
  for update;

  if not found or v_invite.email <> v_email then
    raise exception 'invalid_invitation' using errcode = '22023';
  end if;

  if exists (select 1 from public.workspace_members where user_id = v_user) then
    raise exception 'already_in_workspace' using errcode = '23505';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
    values (v_invite.workspace_id, v_user, 'member');

  update public.workspace_invitations
    set accepted_at = now(), accepted_by = v_user
    where id = v_invite.id;

  return v_invite.workspace_id;
end;
$$;

revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;

-- Fixed-window rate limiter. Returns true if the hit is allowed.
-- Only the server (service_role) can call it.
create function public.rate_limit_hit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_hits integer;
begin
  if p_limit < 1 or p_window_seconds < 1 or char_length(p_bucket) > 200 then
    raise exception 'invalid_rate_limit_args' using errcode = '22023';
  end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into private.rate_limits as r (bucket, window_start, hits)
    values (p_bucket, v_window, 1)
  on conflict (bucket, window_start)
    do update set hits = r.hits + 1
  returning r.hits into v_hits;

  -- Opportunistic clean-up of this bucket's old windows.
  delete from private.rate_limits
    where bucket = p_bucket and window_start < v_window;

  return v_hits <= p_limit;
end;
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

-- Members of the caller's own workspace, with their emails (auth.users is not
-- readable by the authenticated role directly).
create function public.list_workspace_members()
returns table (user_id uuid, email text, role public.workspace_role, joined_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, u.email::text, m.role, m.created_at
  from public.workspace_members m
  join auth.users u on u.id = m.user_id
  where m.workspace_id = (
    select me.workspace_id from public.workspace_members me where me.user_id = (select auth.uid())
  )
  order by m.created_at;
$$;

revoke all on function public.list_workspace_members() from public, anon;
grant execute on function public.list_workspace_members() to authenticated;
