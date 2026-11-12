#!/usr/bin/env bash
# Lab 5 restore drill against the LOCAL Supabase database.
#
# Dumps the `postgres` database of the local Supabase stack, restores it into
# an empty scratch database on the same server, and compares every table's
# row count, a checksum of each Tidewater table, and the access controls
# (RLS, policies, triggers, functions, grants). Timings, versions and
# results go to the evidence directory given as the first argument.
#
# The dump never leaves the database container and is deleted at the end,
# with the scratch database: it holds the seeded data and auth tables.
#
# Usage: labs/05-restore-drill/drill.sh evidence/lab-05
set -euo pipefail

OUT=${1:?usage: drill.sh <evidence-dir>}
HERE=$(cd "$(dirname "$0")" && pwd)
C=supabase_db_tidewater
SRC=postgres
SCRATCH=lab05_restore_drill
DUMP=/tmp/lab05.dump

now() { perl -MTime::HiRes=time -e 'printf "%.3f\n", time'; }
secs() { perl -e 'printf "%.1f\n", $ARGV[1] - $ARGV[0]' "$1" "$2"; }
stamp() { date -u +%Y-%m-%dT%H:%M:%SZ; }
sql() { docker exec -i "$C" psql -U supabase_admin -v ON_ERROR_STOP=1 -AtqF $'\t' "$@"; }
log() { echo "$(stamp)  $*" | tee -a "$OUT/drill-log.txt"; }

mkdir -p "$OUT"
: > "$OUT/drill-log.txt"

log "Restore drill start"
log "Host: $(uname -sm), $(sysctl -n machdep.cpu.brand_string 2>/dev/null || echo unknown CPU)"
log "Docker: $(docker --version)"
log "Supabase CLI: $(npx --no-install supabase --version 2>/dev/null | tail -1)"
log "Database image: $(docker inspect -f '{{.Config.Image}}' "$C")"
log "Server: $(sql -d "$SRC" -c 'select version()')"
log "pg_dump: $(docker exec "$C" pg_dump --version)"
log "pg_restore: $(docker exec "$C" pg_restore --version)"

T_START=$(now)

# 1. Source counts and checksums, taken just before the dump (nothing else
#    writes to the local database during the drill: no app server is running).
sql -d "$SRC" < "$HERE/counts.sql" > "$OUT/counts-source.tsv"
sql -d "$SRC" < "$HERE/checksums.sql" > "$OUT/checksums-source.tsv"
sql -d "$SRC" < "$HERE/structure.sql" > "$OUT/structure-source.tsv"
log "Source: $(wc -l < "$OUT/counts-source.tsv" | tr -d ' ') tables, $(awk -F'\t' '{s+=$3} END {print s}' "$OUT/counts-source.tsv") rows"

# 2. Dump.
T0=$(now)
docker exec "$C" pg_dump -U supabase_admin -d "$SRC" --format=custom --file="$DUMP"
T1=$(now)
SIZE=$(docker exec "$C" stat -c %s "$DUMP")
log "pg_dump (custom format) of '$SRC': $(secs "$T0" "$T1") s, $SIZE bytes"

# 3. Empty scratch database.
sql -d "$SRC" -c "set client_min_messages = warning" -c "drop database if exists $SCRATCH"
sql -d "$SRC" -c "create database $SCRATCH"
log "Created empty scratch database '$SCRATCH'"

# 4. Restore. Errors are kept, not hidden: pg_restore carries on past them.
T2=$(now)
set +e
docker exec "$C" pg_restore -U supabase_admin -d "$SCRATCH" "$DUMP" 2> "$OUT/restore-stderr.txt"
RC=$?
set -e
T3=$(now)
ERRS=$(grep -c '^pg_restore: error:' "$OUT/restore-stderr.txt" || true)
log "pg_restore into '$SCRATCH': $(secs "$T2" "$T3") s, exit code $RC, $ERRS error(s) (restore-stderr.txt)"

# 5. Compare.
sql -d "$SCRATCH" < "$HERE/counts.sql" > "$OUT/counts-restored.tsv"
sql -d "$SCRATCH" < "$HERE/checksums.sql" > "$OUT/checksums-restored.tsv"
sql -d "$SCRATCH" < "$HERE/structure.sql" > "$OUT/structure-restored.tsv"
T4=$(now)
log "Verification queries: $(secs "$T3" "$T4") s"

join -t $'\t' -a1 -a2 -e MISSING -o 0,1.2,2.2 \
  <(awk -F'\t' '{print $1"."$2"\t"$3}' "$OUT/counts-source.tsv" | sort) \
  <(awk -F'\t' '{print $1"."$2"\t"$3}' "$OUT/counts-restored.tsv" | sort) \
  | awk -F'\t' 'BEGIN {OFS="\t"; print "table", "source", "restored", "match"} {print $1, $2, $3, ($2 == $3 ? "yes" : "NO")}' \
  > "$OUT/counts-compared.tsv"
MISMATCH=$(awk -F'\t' 'NR > 1 && $4 != "yes"' "$OUT/counts-compared.tsv" | wc -l | tr -d ' ')
TABLES=$(($(wc -l < "$OUT/counts-compared.tsv") - 1))
log "Row counts: $((TABLES - MISMATCH)) of $TABLES tables match"

if diff -q "$OUT/checksums-source.tsv" "$OUT/checksums-restored.tsv" > /dev/null; then
  log "Checksums: all $(wc -l < "$OUT/checksums-source.tsv" | tr -d ' ') Tidewater tables identical"
else
  log "Checksums: DIFFER"
  diff "$OUT/checksums-source.tsv" "$OUT/checksums-restored.tsv" | tee -a "$OUT/drill-log.txt" || true
fi

if diff -q "$OUT/structure-source.tsv" "$OUT/structure-restored.tsv" > /dev/null; then
  log "Access controls: all $(wc -l < "$OUT/structure-source.tsv" | tr -d ' ') RLS flags, policies, triggers, functions and grants identical"
else
  log "Access controls: DIFFER"
  diff "$OUT/structure-source.tsv" "$OUT/structure-restored.tsv" | tee -a "$OUT/drill-log.txt" || true
fi

T_END=$(now)
log "Dump + restore + verification: $(secs "$T_START" "$T_END") s"

# 6. Clean up: the dump and the scratch copy hold the seeded data.
docker exec "$C" rm -f "$DUMP"
sql -d "$SRC" -c "drop database $SCRATCH"
log "Deleted the dump and dropped '$SCRATCH'"
log "Restore drill end"
