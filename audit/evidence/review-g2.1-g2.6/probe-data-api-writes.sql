-- Writes a signed-in workspace member can send straight to the Supabase Data
-- API (PostgREST), simulated in psql with the same role and JWT claims
-- PostgREST sets. Everything is rolled back. Uses the Lab 5 dummy data.
begin;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true) is not null as claims_set
from auth.users where email = 'lab05-member-1-1@example.com';
set local role authenticated;
\echo '-- Format rules that zod enforces in the server actions:'
update public.clients set website = 'javascript:alert(document.cookie)' where name = 'Lab 5 Client 1-1' returning 'clients.website accepted: ' || website;
update public.contacts set email = 'not an email', phone = 'call me maybe!!'
  where id = (select id from public.contacts where client_id = (select id from public.clients where name = 'Lab 5 Client 1-1') order by id limit 1)
  returning 'contacts.email/phone accepted: ' || email || ' / ' || phone;
insert into public.clients (workspace_id, name, website, created_by)
  select workspace_id, '   x', 'ftp://x', auth.uid() from public.workspace_members where user_id = auth.uid()
  returning 'clients insert accepted: name=' || quote_literal(name) || ' website=' || website;
\echo '-- Size caps (database check constraints):'
savepoint a; update public.clients set website = repeat('a', 301) where name = 'Lab 5 Client 1-2'; rollback to a;
savepoint b; update public.clients set name = repeat('a', 201) where name = 'Lab 5 Client 1-2'; rollback to b;
\echo '-- Billing columns and the billing function:'
savepoint c; update public.workspaces set subscription_status = 'active', plan = 'team' where id = (select workspace_id from public.workspace_members where user_id = auth.uid()); rollback to c;
savepoint d; select public.apply_stripe_event('evt_x', 'x', now(), null, null, null, 'active', 'team', null); rollback to d;
savepoint e; select public.reserve_ai_brief((select workspace_id from public.workspace_members where user_id = auth.uid()), 1000); rollback to e;
rollback;
