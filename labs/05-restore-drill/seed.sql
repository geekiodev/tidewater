-- Lab 5: dummy data for the restore drill. LOCAL DATABASE ONLY.
--
-- Every person is fictional: emails are @example.com, phone numbers use the
-- 555-01xx range reserved for fiction, Stripe ids are made up and every name
-- starts with "Lab 5". Users have no password, so nobody can sign in as them.
--
-- Run once:
--   docker exec -i supabase_db_tidewater psql -U postgres -d postgres -v ON_ERROR_STOP=1 < labs/05-restore-drill/seed.sql
-- It refuses to run a second time.

begin;

do $$
begin
  if exists (select 1 from auth.users where email like 'lab05-%@example.com') then
    raise exception 'Lab 5 seed data is already loaded';
  end if;
end $$;

-- Three workspace owners. The sign-up trigger (private.handle_new_user)
-- creates each workspace and its owner membership, as a real sign-up would.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
  format('lab05-owner-%s@example.com', w), '', now(),
  '{"provider":"email","providers":["email"]}',
  jsonb_build_object('workspace_name', format('Lab 5 %s', (array['Harbor Agency', 'Lighthouse Studio', 'Pier Partners'])[w])),
  now(), now(), '', '', '', ''
from generate_series(1, 3) as w;

-- Two members per workspace, signed up without a workspace (as through an invitation).
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
  format('lab05-member-%s-%s@example.com', w, m), '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
from generate_series(1, 3) as w, generate_series(1, 2) as m;

create temp table lab05_ws on commit drop as
select ws.id, row_number() over (order by ws.name)::int as w
from public.workspaces ws
where ws.name like 'Lab 5 %';

insert into public.workspace_members (workspace_id, user_id, role)
select lw.id, u.id, 'member'
from lab05_ws lw
join auth.users u on u.email like format('lab05-member-%s-%%@example.com', lw.w);

-- Billing state, as the Stripe webhook would have set it (made-up ids).
update public.workspaces ws set
  stripe_customer_id = format('cus_Lab05Seed%s', lw.w),
  stripe_subscription_id = format('sub_Lab05Seed%s', lw.w),
  plan = case when lw.w = 1 then 'team' else 'starter' end,
  subscription_status = case when lw.w = 3 then 'past_due' else 'active' end,
  current_period_end = now() + interval '20 days',
  billing_event_at = now()
from lab05_ws lw
where ws.id = lw.id;

-- Two invitations per workspace: one open, one accepted.
insert into public.workspace_invitations (workspace_id, email, token_hash, invited_by, accepted_at, accepted_by)
select
  lw.id,
  format('lab05-invitee-%s-%s@example.com', lw.w, i),
  encode(sha256(gen_random_uuid()::text::bytea), 'hex'),
  owner.user_id,
  case when i = 2 then now() end,
  case when i = 2 then (select user_id from public.workspace_members
                        where workspace_id = lw.id and role = 'member' order by user_id limit 1) end
from lab05_ws lw
join public.workspace_members owner on owner.workspace_id = lw.id and owner.role = 'owner',
generate_series(1, 2) as i;

-- Ten clients per workspace.
insert into public.clients (workspace_id, name, website, created_by)
select lw.id, format('Lab 5 Client %s-%s', lw.w, c), format('https://client-%s-%s.example.com', lw.w, c), owner.user_id
from lab05_ws lw
join public.workspace_members owner on owner.workspace_id = lw.id and owner.role = 'owner',
generate_series(1, 10) as c;

-- Three contacts per client.
insert into public.contacts (workspace_id, client_id, full_name, email, phone, job_title)
select
  cl.workspace_id, cl.id,
  format('Lab 5 Contact %s', k),
  format('lab05-contact-%s-%s@example.com', substr(cl.id::text, 1, 8), k),
  format('555-01%s', lpad(((row_number() over ()) % 100)::text, 2, '0')),
  (array['Owner', 'Marketing lead', 'Finance'])[k]
from public.clients cl, generate_series(1, 3) as k
where cl.name like 'Lab 5 %';

-- Four notes per client.
insert into public.notes (workspace_id, client_id, body, author_id)
select
  cl.workspace_id, cl.id,
  format('Lab 5 dummy note %s: %s', n,
    (array['Kickoff call scheduled.', 'Sent the proposal.', 'Asked for a revised quote.', 'Renewal due next quarter.'])[n]),
  cl.created_by
from public.clients cl, generate_series(1, 4) as n
where cl.name like 'Lab 5 %';

-- Three months of AI brief usage per workspace.
insert into public.ai_usage (workspace_id, month, briefs, input_tokens, output_tokens)
select lw.id, (date_trunc('month', now()) - make_interval(months => mo))::date, 5 * (mo + 1), 12000 * (mo + 1), 3000 * (mo + 1)
from lab05_ws lw, generate_series(0, 2) as mo;

-- Rate-limit windows and processed Stripe events.
insert into private.rate_limits (bucket, window_start, hits)
select format('lab05:login:owner-%s', w), date_trunc('minute', now()) - make_interval(mins => h), h
from generate_series(1, 3) as w, generate_series(1, 2) as h;

insert into private.stripe_events (id, type, outcome)
select format('evt_Lab05Seed%s', e), (array['checkout.session.completed', 'customer.subscription.updated', 'invoice.payment_failed'])[e], 'applied'
from generate_series(1, 3) as e;

commit;
