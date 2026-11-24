# Lab 10: uptime alert fired once, recovered by rotating the production secret key

Nov 24, 2026, https://tidewater-bice.vercel.app (production). A controlled outage: Production's `SUPABASE_SECRET_KEY` was set to a deliberately fake value (`sb_secret_invalid-lab10-uptime-test`, not a real key) and `main` was redeployed, so `/api/health` returned 503 (`"database": "error"`). Recovery was the planned rotation: the owner-created key `vercel_production_2` was swapped in and `main` was redeployed again. After that, the owner deleted `vercel_production`.

**Monitor:** Sentry uptime monitor 11055513, "Uptime check for tidewater-bice.vercel.app/api/health", project `javascript-nextjs`, environment production. GET every 1 minute, 5 s timeout, defaults of 3 failures to open an issue and 1 success to resolve it. Alert: "Lab 10: /api/health down → email owner" (new issue, resolved, regression), sent to the owner by name. Created by the owner. Sentry's form warns that uptime check data "may be stored outside your selected data region".

| Time (UTC) | Event | Source |
| --- | --- | --- |
| 15:22:14 | Production `SUPABASE_SECRET_KEY` set to the fake value | agent log |
| 15:23:12 | Broken deployment live (redeploy of main `177aead`); `/api/health` 503 | agent log |
| 15:26 | Sentry issue JAVASCRIPT-NEXTJS-8 "Downtime detected for https://tidewater-bice.vercel.app/api/health"; **2 emails** (the new Lab 10 alert and the existing Lab 9 "email on every new issue" rule) | owner's inbox, 10:26 AM EST |
| 15:30:31 | Owner reports the email in chat | chat |
| 15:30:33 | `vercel_production_2` set as Production's `SUPABASE_SECRET_KEY` (checked against the hosted API first: HTTP 200) | agent log |
| 15:31:36 | Fixed deployment live; `/api/health` 200 | agent log |
| 15:32 | "Downtime detected … was resolved" email | owner's inbox, 10:32 AM EST |
| by 15:35:53 | `vercel_production` deleted by the owner; remaining secret keys: `vercel_production_2`, `vercel_preview` | Supabase API (names only) |

**Measured:**

- Outage, from the broken version live to the fixed version live: **8 min 24 s**.
- Time to alert: about **3 min** (15:23:12 → 15:26).
- Time from the alert email to the fix live: about **5½ min**, mostly waiting for the person to see the email and act. The redeploy itself took 62 s.
- Recovery to the resolved email: under 1 min.

**Rotation:**

- `vercel_production` was replaced by `vercel_production_2` on **2026-11-24**, in the safe order: new key in, deploy, confirm health 200, then delete the old key.
- Preview still uses `vercel_preview`.
- This is the second rotation on this project. The first was the deletion of the `default` secret key on Nov 19.

**Background health poll** (every 30 s, agent machine):

```
2026-11-24T15:23:45Z HTTP 503
2026-11-24T15:24:15Z HTTP 503
2026-11-24T15:24:46Z HTTP 503
2026-11-24T15:25:16Z HTTP 503
2026-11-24T15:25:46Z HTTP 503
2026-11-24T15:26:16Z HTTP 503
2026-11-24T15:26:47Z HTTP 503
2026-11-24T15:27:17Z HTTP 503
2026-11-24T15:27:47Z HTTP 503
2026-11-24T15:28:18Z HTTP 503
2026-11-24T15:28:48Z HTTP 503
2026-11-24T15:29:18Z HTTP 503
2026-11-24T15:29:48Z HTTP 503
2026-11-24T15:30:19Z HTTP 503
2026-11-24T15:30:49Z HTTP 503
2026-11-24T15:31:19Z HTTP 503
2026-11-24T15:31:50Z HTTP 200
2026-11-24T15:32:20Z HTTP 200
2026-11-24T15:32:50Z HTTP 200
2026-11-24T15:33:21Z HTTP 200
2026-11-24T15:33:51Z HTTP 200
2026-11-24T15:34:22Z HTTP 200
2026-11-24T15:34:52Z HTTP 200
2026-11-24T15:35:23Z HTTP 200
2026-11-24T15:35:54Z HTTP 200
2026-11-24T15:36:24Z HTTP 200
2026-11-24T15:36:55Z HTTP 200
```
