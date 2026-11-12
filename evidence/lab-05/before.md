# Lab 5 before: no backup, no restore, no targets

Nov 11, 2026, branch `lab-05-restore-drill` at `4f68a3c` (main), local Supabase.

- **No backup has ever been taken or restored.** Nothing in the repo dumps the database or describes how to restore it. The README's "What's not built yet" lists "backups policy" as missing.
- **No RTO or RPO.** Nobody could say how much data a failure would lose or how long recovery would take.
- **The local database held only setup leftovers:** 1 workspace, 1 user, 2 clients, 2 contacts, 2 notes and a few rate-limit and Stripe event rows from the Oct setup walkthrough (`counts-before-seed.tsv`). Not enough to show a restore brings back every table.
- **No Postgres client tools on the host** (`pg_dump`, `pg_restore` and `psql` are not installed). The drill uses the copies inside the Supabase database container, which match the server's version (17.11).
