# Lab 10: a bad release, rolled back on purpose

Nov 24, 2026. The "bad" release is PR #21 (merge B, commit `5d28546`): one line of text on the landing page, "Lab 10 rollback test: this line is the “bad” release…". It went to production through the pipeline: merged to main, built, held by the deployment check until CI on main passed, then promoted. It was then rolled back with Vercel's Instant Rollback (`vercel rollback`) to the previous production deployment (`tidewater-j666nudne`, the 15:31 recovery build). The live page was checked every 5 s (every 2 s after the rollback) for the line.

| Time (UTC) | Event |
| --- | --- |
| 15:39:20 | PR #21 merged (relaxation B) |
| 15:39:25 | Production build started (`dpl_Byo4p8SA8dftdGPDwJc8bh1uWoB7`) |
| 15:39:54 | Build ready, **STAGED**: held by the deployment check while CI on main ran |
| 15:41:27 | Promoted after CI passed |
| 15:41:33 | Bad line first seen on https://tidewater-bice.vercel.app |
| 15:41:44 | `vercel rollback https://tidewater-j666nudne-geekiodevs-projects.vercel.app --yes` |
| 15:41:49 | "Success! tidewater was rolled back" (3 s) |
| 15:41:51 | Bad line gone from the live page; `/api/health` 200 |

**Measured:**

- **Bad version live: about 18 to 24 s** (promoted between 15:41:27 and 15:41:33; gone by 15:41:51).
- **The rollback itself took 3 s.**
- These numbers measure the mechanism, because the rollback started the moment the line was seen. In a real incident, the time to notice dominates. For an outage, that is the uptime alert's 3 minutes (see `uptime-outage-rotation.md`). For a bug that isn't an outage, there's no alert at all.

**After a rollback, Vercel turns off automatic promotion** of new production deployments (https://vercel.com/docs/instant-rollback). Main still contains the bad line until the Lab 10 PR reverts it. Once that PR's deployment is built, it has to be promoted by hand (`vercel promote`), which also turns automatic promotion back on.

Hobby can roll back only to the immediately previous production deployment.

Screenshots (kept outside the repo, for posts): before, bad release live, after rollback.
