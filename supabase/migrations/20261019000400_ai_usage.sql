-- Prompt 4: monthly AI usage per workspace.
--
-- The quota functions are callable ONLY by service_role (the server), after
-- the server has checked the session, membership and subscription. They are
-- not exposed to `authenticated`, because a signed-in user can call exposed
-- RPCs directly with their own JWT and could pass any limit they liked.

create table public.ai_usage (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  briefs integer not null default 0 check (briefs >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, month)
);

revoke all on public.ai_usage from public, anon, authenticated;
grant select on public.ai_usage to authenticated;
grant all on public.ai_usage to service_role;

alter table public.ai_usage enable row level security;

create policy ai_usage_select_members on public.ai_usage for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));

-- Reserve one brief for this month. Returns false if the cap is reached.
-- Atomic: concurrent requests can't both take the last slot.
create function public.reserve_ai_brief(p_workspace_id uuid, p_monthly_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month date := date_trunc('month', now() at time zone 'utc')::date;
  v_briefs integer;
begin
  if p_monthly_limit < 0 then
    raise exception 'invalid_limit' using errcode = '22023';
  end if;

  insert into public.ai_usage as u (workspace_id, month, briefs)
    values (p_workspace_id, v_month, 1)
  on conflict (workspace_id, month)
    do update set briefs = u.briefs + 1, updated_at = now()
    where u.briefs < p_monthly_limit
  returning u.briefs into v_briefs;

  -- No row returned: the conflict update was skipped because the cap is reached.
  -- (A fresh insert with a limit of 0 must also be refused.)
  if v_briefs is null then
    return false;
  end if;
  if v_briefs > p_monthly_limit then
    update public.ai_usage set briefs = briefs - 1
      where workspace_id = p_workspace_id and month = v_month;
    return false;
  end if;
  return true;
end;
$$;

-- Give a reservation back (the model call failed), and/or add token counts.
create function public.settle_ai_brief(
  p_workspace_id uuid,
  p_succeeded boolean,
  p_input_tokens integer,
  p_output_tokens integer
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_usage
    set briefs = case when p_succeeded then briefs else greatest(briefs - 1, 0) end,
        input_tokens = input_tokens + greatest(coalesce(p_input_tokens, 0), 0),
        output_tokens = output_tokens + greatest(coalesce(p_output_tokens, 0), 0),
        updated_at = now()
    where workspace_id = p_workspace_id
      and month = date_trunc('month', now() at time zone 'utc')::date;
$$;

revoke all on function public.reserve_ai_brief(uuid, integer) from public, anon, authenticated;
revoke all on function public.settle_ai_brief(uuid, boolean, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_ai_brief(uuid, integer) to service_role;
grant execute on function public.settle_ai_brief(uuid, boolean, integer, integer) to service_role;
