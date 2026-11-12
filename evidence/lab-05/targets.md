# Lab 5 recovery targets

Set Nov 11, 2026 (02:47 UTC, Nov 12), before the drill was run. They are committed on their own, ahead of any measurement, so the result can't shape the target.

| Target | Value | What it means for Tidewater |
| --- | --- | --- |
| **RPO** (recovery point objective) | **24 hours** | At most one day of workspace data (clients, contacts, notes, members, billing state) may be lost. A small agency can re-enter a day of notes from email and calendars; it can't re-enter a month. A daily backup meets it; anything less frequent doesn't. |
| **RTO** (recovery time objective) | **4 hours** | From deciding to restore to the app serving the restored data. One person (the owner) does the restore, so the target allows for them being reached, the restore itself and a check of the result. |

## What the local drill can and can't show

- **RTO:** the drill times the technical part: dump, restore into an empty database, and checking the result. It passes if that part takes a small fraction of the 4 hours (under 30 minutes), leaving the rest for being reached, deciding and pointing the app at the restored database.
- **RPO:** depends on how often backups are taken, and the local database has no backup schedule. The drill can show that a dump is complete and consistent at the moment it's taken (every row in every table comes back). Whether 24 hours is met in production depends on the hosted project's backup frequency, which is checked when the drill is re-run against the hosted database before first deploy.

## Pass criteria

1. Every table in the dumped database has the same row count after restore, compared table by table, including Supabase's own schemas (`auth`, `storage` and the others).
2. The Tidewater tables (`public.*`, `private.*`) hold the same data, compared by a checksum of each table's rows.
3. The technical restore time is under 30 minutes.
