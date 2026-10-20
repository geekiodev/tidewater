-- Minimal stand-in for the parts of Supabase that the migrations depend on,
-- so the migrations and RLS policies can be tested against a plain Postgres
-- (CI service container, or a local cluster) when the full Supabase stack
-- isn't available. This is NOT used in development or production: there,
-- the real Supabase stack provides all of this.
--
-- What it reproduces:
--  * roles anon / authenticated / service_role (service_role bypasses RLS)
--  * auth.users with the columns our migrations use
--  * auth.uid() / auth.jwt() reading the request.jwt.claims setting, the way
--    PostgREST passes the caller's JWT claims to Postgres
--  * Supabase's default privileges: anon and authenticated get ALL on new
--    objects in `public` (so tests prove our explicit REVOKEs matter)

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select auth.jwt() ->> 'role'
$$;

grant execute on function auth.jwt(), auth.uid(), auth.role() to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
