-- md5 of every row of each Tidewater table, in a fixed order, so the source
-- and restored tables can be compared by content and not just by count.
-- Output: schema<TAB>table<TAB>md5.
select n.nspname, c.relname,
       (xpath('/row/h/text()',
              query_to_xml(format('select md5(coalesce(string_agg(t::text, %L order by t::text), %L)) as h from %I.%I t',
                                  E'\n', '', n.nspname, c.relname), false, true, '')))[1]::text
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'p') and n.nspname in ('public', 'private')
order by 1, 2;
