-- The parts of the Tidewater schema that enforce access, so a restore that
-- brings back the rows but loses a policy, RLS flag, trigger, function or
-- grant shows up as a difference. Output: kind<TAB>name<TAB>detail, sorted.
select * from (
  select 'rls', n.nspname || '.' || c.relname, c.relrowsecurity::text || '/' || c.relforcerowsecurity::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private') and c.relkind = 'r'
  union all
  select 'policy', schemaname || '.' || tablename || '.' || policyname,
         md5(concat_ws('|', permissive, roles::text, cmd, qual, with_check))
  from pg_policies where schemaname in ('public', 'private')
  union all
  select 'trigger', n.nspname || '.' || c.relname || '.' || t.tgname, md5(pg_get_triggerdef(t.oid))
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
  where not t.tgisinternal and (n.nspname in ('public', 'private') or t.tgname = 'on_auth_user_created')
  union all
  select 'function', n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         md5(pg_get_functiondef(p.oid) || coalesce(p.proacl::text, ''))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prokind = 'f'
  union all
  select 'grant', table_schema || '.' || table_name || ' ' || grantee, string_agg(privilege_type, ',' order by privilege_type)
  from information_schema.role_table_grants
  where table_schema in ('public', 'private')
  group by table_schema, table_name, grantee
) s
order by 1, 2;
