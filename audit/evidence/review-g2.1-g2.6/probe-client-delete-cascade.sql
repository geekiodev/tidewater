-- A member (not the owner, not the notes' author) deletes a client.
-- Everything is rolled back. Uses the Lab 5 dummy data.
begin;
select count(*) as notes_before from public.notes where client_id = (select id from public.clients where name = 'Lab 5 Client 1-1') \gset
select count(*) as contacts_before from public.contacts where client_id = (select id from public.clients where name = 'Lab 5 Client 1-1') \gset
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true) is not null as claims_set
from auth.users where email = 'lab05-member-1-1@example.com';
set local role authenticated;
with d as (delete from public.notes where client_id = (select id from public.clients where name = 'Lab 5 Client 1-1') returning 1)
  select 'member deletes the owner''s notes directly: ' || count(*) || ' rows (RLS: author or owner only)' from d;
with d as (delete from public.clients where name = 'Lab 5 Client 1-1' returning 1)
  select 'member deletes the client: ' || count(*) || ' row' from d;
reset role;
select 'notes left: ' || count(*) || ' of ' || :notes_before from public.notes n
  where not exists (select 1 from public.clients c where c.id = n.client_id);
select 'contacts left: ' || count(*) || ' of ' || :contacts_before from public.contacts n
  where not exists (select 1 from public.clients c where c.id = n.client_id);
rollback;
