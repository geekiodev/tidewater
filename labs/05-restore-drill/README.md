# Lab 5: a restore that has actually been done

Closes DATA-001 and DATA-002 from `audit/findings.json` for the local database. Run Nov 11, 2026 (02:47 to 02:50 UTC on Nov 12). Evidence is in [`evidence/lab-05/`](../../evidence/lab-05/).

## 1. The gates and why they matter

- **G2.3, backups with a performed restore (L2).** A backup that has never been restored is a guess. The first restore usually turns up something: a missing schema, a permission error, a tool version mismatch.
- **G3.5, a restore drill against stated RTO and RPO (L3).** A buyer will ask "how much data could we lose, and how long would we be down?" There's no answer without targets and a timed drill.

The constraint for this app: Tidewater's access control lives in the database (RLS policies, triggers, security-definer functions, grants). A restore that brings the rows back without those would expose every workspace's data, so the drill checks them too, not just row counts.

Maps to: NIST 800-53 CP-9 (system backup), CP-4 (contingency plan testing), CP-10 (system recovery and reconstitution), CP-2 (contingency plan, for the RTO and RPO); SOC 2 A1.2, A1.3; ISO 27001:2022 A.8.13 (information backup), A.5.30 (ICT readiness for business continuity).

## 2. Starting point

`main` at `4f68a3c`. Local Supabase (CLI 2.121.0, image `supabase/postgres:17.11.0.004`) on Docker 29.9.1, Apple M1 Pro. The `v0-as-built` tag is not touched by this lab.

## 3. The checks

```bash
# 1. Targets first, committed before anything is measured (8fbc409)
cat evidence/lab-05/targets.md

# 2. Dummy data in every Tidewater table (refuses to run twice)
docker exec -i supabase_db_tidewater psql -U postgres -d postgres -v ON_ERROR_STOP=1 < labs/05-restore-drill/seed.sql

# 3. The timed drill: dump, restore into an empty scratch database, compare
labs/05-restore-drill/drill.sh evidence/lab-05/run-2
```

`drill.sh` dumps the `postgres` database (the one published on port 54322) with `pg_dump --format=custom`, creates an empty database `lab05_restore_drill` on the same server, restores into it with `pg_restore`, then compares:

- `counts.sql`: the exact row count of every table in every schema, Supabase's own included (64 tables).
- `checksums.sql`: an md5 over every row of each of the 9 Tidewater tables.
- `structure.sql`: RLS flags, policies, triggers, functions and table grants in `public` and `private`, plus the sign-up trigger on `auth.users` (70 items).

It then deletes the dump and drops the scratch database, since both hold the seeded data and the auth tables.

## 4. Before

`before.md`: no backup had ever been taken or restored, there was no RTO or RPO, and the local database held only a handful of rows left from the Oct setup walkthrough (`counts-before-seed.tsv`).

## 5. The fix

On branch `lab-05-restore-drill`:

- **Targets, committed on their own before the drill** (`targets.md`, commit `8fbc409`): **RPO 24 hours, RTO 4 hours**. Pass criteria: every table's row count matches, the Tidewater tables' checksums match, and the technical part of the restore takes under 30 minutes.
- **Seed** (`seed.sql`): 3 workspace owners signed up through the real sign-up trigger, 6 members, 6 invitations, 30 clients, 90 contacts, 120 notes, 9 months of AI usage, rate-limit windows and Stripe events. Every email is `@example.com`, phone numbers are in the fictional 555-01xx range, Stripe ids are made up, and the users have no password.
- **The drill script and its three comparison queries**, so it can be run again unchanged, including against the hosted database before first deploy.

Row counts, before and after seeding (`counts-before-seed.tsv`, `counts-after-seed.tsv`):

| Table | Before | After seed |
| --- | ---: | ---: |
| `auth.users` | 1 | 10 |
| `public.workspaces` | 1 | 4 |
| `public.workspace_members` | 1 | 10 |
| `public.workspace_invitations` | 1 | 7 |
| `public.clients` | 2 | 32 |
| `public.contacts` | 2 | 92 |
| `public.notes` | 2 | 122 |
| `public.ai_usage` | 1 | 10 |
| `private.rate_limits` | 5 | 11 |
| `private.stripe_events` | 2 | 5 |

## 6. After

`run-2/` is the drill of record. `run-1/` is the first run, half a minute earlier, before the access-control check existed: same result on counts and checksums. Adding that check was the lab's one change of plan, because matching row counts alone would also pass a restore that had lost every RLS policy.

| What | Evidence | Result |
| --- | --- | --- |
| Tools | `run-2/drill-log.txt` | `pg_dump` and `pg_restore` 17.11 (inside the DB container, same version as the server), PostgreSQL 17.11, Supabase CLI 2.121.0, Docker 29.9.1 |
| Dump | `run-2/drill-log.txt` | 0.2 s, 486,599 bytes, custom format |
| Restore into an empty database | `run-2/drill-log.txt`, `run-2/restore-stderr.txt` | 0.5 s, exit code 0, no errors (`restore-stderr.txt` is empty) |
| Row counts, table by table | `run-2/counts-compared.tsv` | **64 of 64 tables match**, 604 rows |
| Tidewater data | `run-2/checksums-*.tsv` | **9 of 9 tables identical** |
| Access controls | `run-2/structure-*.tsv` | **70 of 70 identical**: 9 RLS flags, 20 policies, 4 triggers, 12 functions, 25 grants |
| Dump, restore and verification together | `run-2/drill-log.txt` | **1.4 s** |

**Against the targets:**

- **RTO 4 hours: met for the technical part.** 1.4 s against a 30-minute allowance. The time is that small because the database is: 604 rows. It says the procedure works, not how long a hosted restore of real data takes; the hosted re-drill measures that.
- **RPO 24 hours: not measurable locally.** The drill shows a dump is complete and consistent at the moment it's taken (nothing lost between dump and restore). The local database has no backup schedule, so there's nothing that keeps data loss under 24 hours. That depends on the hosted project's backup frequency.

## 7. Evidence kept

Everything above is in `evidence/lab-05/`: counts, checksums (md5 values only), access-control fingerprints and logs. The dump itself is not kept: it never left the database container and was deleted at the end of each run, with the scratch database. No file holds an email address, row contents or a credential.

## 8. Done when

- [x] RTO and RPO written down before the drill (`targets.md`, committed first).
- [x] Every Tidewater table holds dummy data (`counts-after-seed.tsv`).
- [x] A dump has been restored into an empty database and compared table by table (64 of 64).
- [x] The restored data and access controls are identical, not just the counts.
- [x] Timings, tool versions and the date are recorded, and the technical restore is within target.
- [ ] RPO met in production: needs the hosted project's backups (re-drill before first deploy).

## Open after this lab

- **Re-drill against the hosted database before first deploy.** The local drill proves the procedure and the tooling, not the hosted backups. Before first deploy: confirm the hosted project's backup frequency meets the 24-hour RPO, restore a hosted backup into a new, separate project (not a database on the same server), run `counts.sql`, `checksums.sql` and `structure.sql` against both, and time it end to end against the 4-hour RTO, including pointing a build of the app at the restored project.
- **A same-server restore isn't a disaster restore.** Here the dump and the scratch database sat on the same machine as the source. A real backup has to live somewhere else, and a real restore goes to a fresh server, where the Supabase roles and extensions have to exist first. The hosted re-drill covers both.
- **Not in the drill:** the `_supabase` database (Supabase's own analytics and logs) and `tidewater_test` (test-suite data, rebuilt on every test run). Neither holds workspace data.
- **README:** "backups policy" is still listed under "What's not built yet"; DOCS-001 updates it.
