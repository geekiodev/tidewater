-- Prompt 2: clients (companies), contacts (people) and notes.
--
-- * Every row carries workspace_id; RLS limits all access to members of that
--   workspace.
-- * Contacts and notes reference their client with a COMPOSITE foreign key
--   (client_id, workspace_id), so a row can never point at another
--   workspace's client even if application code passes the wrong client_id.
-- * Size limits are enforced here as well as in the app's input schemas.
-- * Column-level UPDATE grants: workspace_id, client_id and authorship can't
--   be changed after insert.

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;

-- ---------------------------------------------------------------------------

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  website text check (website is null or char_length(website) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clients_id_workspace_unique unique (id, workspace_id)
);

create index clients_workspace_name_idx on public.clients (workspace_id, lower(name));

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  client_id uuid not null,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 200),
  email text check (email is null or char_length(email) <= 254),
  phone text check (phone is null or char_length(phone) <= 50),
  job_title text check (job_title is null or char_length(job_title) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contacts_client_same_workspace
    foreign key (client_id, workspace_id) references public.clients (id, workspace_id) on delete cascade
);

create index contacts_client_idx on public.contacts (workspace_id, client_id, lower(full_name));

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  client_id uuid not null,
  body text not null check (char_length(btrim(body)) between 1 and 10000),
  author_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notes_client_same_workspace
    foreign key (client_id, workspace_id) references public.clients (id, workspace_id) on delete cascade
);

create index notes_client_created_idx on public.notes (workspace_id, client_id, created_at desc);

create trigger clients_set_updated_at before update on public.clients
  for each row execute function private.set_updated_at();
create trigger contacts_set_updated_at before update on public.contacts
  for each row execute function private.set_updated_at();
create trigger notes_set_updated_at before update on public.notes
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on public.clients, public.contacts, public.notes from anon, authenticated, public;

grant select, insert, delete on public.clients, public.contacts, public.notes to authenticated;
grant update (name, website) on public.clients to authenticated;
grant update (full_name, email, phone, job_title) on public.contacts to authenticated;
grant update (body) on public.notes to authenticated;

grant all on public.clients, public.contacts, public.notes to service_role;

alter table public.clients enable row level security;
alter table public.contacts enable row level security;
alter table public.notes enable row level security;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

-- clients
create policy clients_select on public.clients for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy clients_insert on public.clients for insert to authenticated
  with check (
    (select private.is_workspace_member(workspace_id))
    and created_by = (select auth.uid())
  );
create policy clients_update on public.clients for update to authenticated
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));
create policy clients_delete on public.clients for delete to authenticated
  using ((select private.is_workspace_member(workspace_id)));

-- contacts
create policy contacts_select on public.contacts for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy contacts_insert on public.contacts for insert to authenticated
  with check ((select private.is_workspace_member(workspace_id)));
create policy contacts_update on public.contacts for update to authenticated
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));
create policy contacts_delete on public.contacts for delete to authenticated
  using ((select private.is_workspace_member(workspace_id)));

-- notes: any member can read and add; only the author edits; the author or
-- the workspace owner deletes.
create policy notes_select on public.notes for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy notes_insert on public.notes for insert to authenticated
  with check (
    (select private.is_workspace_member(workspace_id))
    and author_id = (select auth.uid())
  );
create policy notes_update on public.notes for update to authenticated
  using (
    (select private.is_workspace_member(workspace_id))
    and author_id = (select auth.uid())
  )
  with check (
    (select private.is_workspace_member(workspace_id))
    and author_id = (select auth.uid())
  );
create policy notes_delete on public.notes for delete to authenticated
  using (
    (select private.is_workspace_member(workspace_id))
    and (author_id = (select auth.uid()) or (select private.is_workspace_owner(workspace_id)))
  );
