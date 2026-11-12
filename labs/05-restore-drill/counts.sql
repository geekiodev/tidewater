-- Exact row count of every table in the connected database, outside the
-- Postgres system catalogs. Run as supabase_admin so no table is hidden.
-- Output: schema<TAB>table<TAB>rows, sorted.
select n.nspname, c.relname,
       (xpath('/row/n/text()',
              query_to_xml(format('select count(*) as n from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text::bigint
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'p')
  and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
  and n.nspname not like 'pg_temp%'
order by 1, 2;
