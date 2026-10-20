-- Prompt 3: subscriptions via Stripe Checkout.
--
-- * Subscription state lives on workspaces. The authenticated role can read
--   it but can't write it (only `name` is granted for UPDATE, see Prompt 1).
--   Only the Stripe webhook (service_role) changes it, via
--   apply_stripe_event().
-- * apply_stripe_event() records the Stripe event id and applies the change
--   in ONE transaction, so a redelivered event is detected and skipped.
-- * Creating clients, contacts and notes requires an active subscription,
--   enforced in the RLS insert policies, not just in the app.

alter table public.workspaces
  add column stripe_customer_id text unique check (stripe_customer_id is null or stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  add column stripe_subscription_id text unique check (stripe_subscription_id is null or stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'),
  add column plan text check (plan is null or plan in ('starter', 'team')),
  add column subscription_status text not null default 'none' check (
    subscription_status in (
      'none', 'incomplete', 'incomplete_expired', 'trialing', 'active',
      'past_due', 'canceled', 'unpaid', 'paused'
    )
  ),
  add column current_period_end timestamptz,
  add column billing_event_at timestamptz;

-- Processed Stripe events, for idempotency. Internal only.
create table private.stripe_events (
  id text primary key check (id ~ '^evt_[A-Za-z0-9]+$'),
  type text not null check (char_length(type) <= 100),
  outcome text,
  received_at timestamptz not null default now()
);

revoke all on private.stripe_events from public, anon, authenticated;
grant all on private.stripe_events to service_role;
alter table private.stripe_events enable row level security;

-- ---------------------------------------------------------------------------

create function private.workspace_is_active(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspaces w
    where w.id = p_workspace_id
      and w.subscription_status in ('active', 'trialing')
      and w.plan is not null
  );
$$;

revoke all on function private.workspace_is_active(uuid) from public, anon;
grant execute on function private.workspace_is_active(uuid) to authenticated, service_role;

-- Inserts now also require an active subscription.
drop policy clients_insert on public.clients;
create policy clients_insert on public.clients for insert to authenticated
  with check (
    (select private.is_workspace_member(workspace_id))
    and (select private.workspace_is_active(workspace_id))
    and created_by = (select auth.uid())
  );

drop policy contacts_insert on public.contacts;
create policy contacts_insert on public.contacts for insert to authenticated
  with check (
    (select private.is_workspace_member(workspace_id))
    and (select private.workspace_is_active(workspace_id))
  );

drop policy notes_insert on public.notes;
create policy notes_insert on public.notes for insert to authenticated
  with check (
    (select private.is_workspace_member(workspace_id))
    and (select private.workspace_is_active(workspace_id))
    and author_id = (select auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Webhook entry point. Returns one of:
--   'applied', 'duplicate', 'stale', 'unknown_workspace', 'customer_mismatch'
-- p_status null means "link customer/subscription ids only"
-- (checkout.session.completed).
-- ---------------------------------------------------------------------------

create function public.apply_stripe_event(
  p_event_id text,
  p_event_type text,
  p_event_created timestamptz,
  p_workspace_id uuid,
  p_customer_id text,
  p_subscription_id text,
  p_status text,
  p_plan text,
  p_current_period_end timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ws public.workspaces%rowtype;
  v_outcome text;
begin
  insert into private.stripe_events (id, type) values (p_event_id, p_event_type)
    on conflict (id) do nothing;
  if not found then
    return 'duplicate';
  end if;

  if p_workspace_id is not null then
    select * into v_ws from public.workspaces where id = p_workspace_id for update;
  elsif p_customer_id is not null then
    select * into v_ws from public.workspaces where stripe_customer_id = p_customer_id for update;
  end if;

  if v_ws.id is null then
    v_outcome := 'unknown_workspace';
  elsif v_ws.stripe_customer_id is not null and p_customer_id is not null
        and v_ws.stripe_customer_id <> p_customer_id then
    v_outcome := 'customer_mismatch';
  elsif p_status is null then
    update public.workspaces
      set stripe_customer_id = coalesce(stripe_customer_id, p_customer_id),
          stripe_subscription_id = coalesce(stripe_subscription_id, p_subscription_id)
      where id = v_ws.id;
    v_outcome := 'applied';
  elsif v_ws.billing_event_at is not null and v_ws.billing_event_at > p_event_created then
    -- An older event arriving after a newer one: don't roll state back.
    v_outcome := 'stale';
  elsif v_ws.stripe_subscription_id is not null
        and p_subscription_id is distinct from v_ws.stripe_subscription_id
        and p_status not in ('active', 'trialing') then
    -- An update about some other (old) subscription must not cancel the current one.
    v_outcome := 'stale';
  else
    update public.workspaces
      set stripe_customer_id = coalesce(stripe_customer_id, p_customer_id),
          stripe_subscription_id = p_subscription_id,
          subscription_status = p_status,
          plan = p_plan,
          current_period_end = p_current_period_end,
          billing_event_at = p_event_created
      where id = v_ws.id;
    v_outcome := 'applied';
  end if;

  update private.stripe_events set outcome = v_outcome where id = p_event_id;
  return v_outcome;
end;
$$;

revoke all on function public.apply_stripe_event(text, text, timestamptz, uuid, text, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.apply_stripe_event(text, text, timestamptz, uuid, text, text, text, text, timestamptz)
  to service_role;
