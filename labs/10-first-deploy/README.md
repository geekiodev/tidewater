# Lab 10: the first deploy, a rollback on purpose, and an alert that fired

Closes DELIV-001 (G3.4) and OBS-002's uptime part (G3.3), and closes the ABUSE-001 acceptance. It also passes Gate 1. Run Nov 24, 2026, against https://tidewater-bice.vercel.app (staging data only, `@example.com` addresses). Evidence is in [`evidence/lab-10/`](../../evidence/lab-10/). All times are UTC.

**Who did what.** The owner (@geekiodev):

- added the Deployment Check;
- set the Supabase Auth URLs and password settings;
- created the Stripe webhook endpoint and stored its secret in Vercel;
- created the test user, signed in, subscribed (Stripe test card) and added a client and a note;
- ran the spoofing test from their machine;
- created the Sentry uptime monitor and its alert;
- created `vercel_production_2` and deleted `vercel_production`.

The agent:

- connected the Vercel project to Git and added `vercel.json`;
- set `APP_URL` and swapped keys into Vercel (reading the owner-created key with a read-only token);
- ran the deploys, the redeploys, the controlled outage and the rollback;
- ran the signed-out smoke tests;
- read the logs, and recorded everything.

The agent never submitted a password to the live site.

## 1. The gates and why they matter

- **G3.4, a deploy pipeline with a tested rollback (L3).** Releases that only one laptop can produce, and that nobody has ever rolled back, turn every bad release into an outage that lasts as long as the fix takes to write.
- **G3.3, an alert that reaches a named person (L3).** Lab 9 did this for errors. An outage throws no error, so something outside the app has to notice.
- **ABUSE-001.** The acceptance said: confirm on the deployed app, or don't close it.

Maps to: NIST 800-53 CM-3 (configuration change control), CP-10 (recovery and reconstitution), SI-4 (system monitoring), IR-4 (incident handling), IA-5 (authenticator management, for the rotation), SC-5; SOC 2 CC8.1, CC7.2, CC7.4; ISO 27001:2022 A.8.32 (change management), A.8.16 (monitoring), A.5.17.

## 2. Starting point

`main` at `98baecd` (Lab 11). Vercel project `tidewater`: no Git connection, no deployments, framework preset "Other". Hosted Supabase `tidewater-staging` with schema only. Production `SUPABASE_SECRET_KEY` was `vercel_production`.

## 3. The checks

```bash
# Pipeline: which deployment is production, and when it was promoted vs when CI finished
vercel api "/v6/deployments?projectId=tidewater&limit=5"   # target, state, readySubstate, githubCommitRef
gh run list --branch main --limit 1
# Signed-out smoke test
curl https://tidewater-bice.vercel.app/api/health; curl -I https://tidewater-bice.vercel.app/
# ABUSE-001 on the live app (owner's machine)
python3 -I labs/10-first-deploy/abuse-001-live-test.py https://tidewater-bice.vercel.app evidence/lab-10/abuse-001-live.txt
# Rollback
vercel rollback <previous-production-deployment> --yes
```

## 4. Before

- Nothing was deployed and nothing could be: there was no pipeline.
- No rollback had ever been done, and nothing watched `/api/health`.
- ABUSE-001's fix was merged (Lab 11) but unproven on Vercel. Its acceptance was due to end at first deploy.

## 5. The fix

**Pipeline**

- **Git connection:** `vercel git connect` linked the project to `geekiodev/tidewater`. The production branch is `main`, and every pull request gets a preview deployment.
- **Framework:** `vercel.json` sets it to Next.js (`"framework": "nextjs"`, which overrides the project's "Other").
- **CI gate:** the owner added a Deployment Check on "Type check, lint, test, build" (Dependabot left out). It holds each production deployment until CI passes on that commit. It's available on Hobby.

**First deploy**

- **Merge A** (PR #20, `vercel.json`) produced the first production deployment from main.
- **Variables:** `APP_URL` was added for Production. The owner set the Supabase Auth Site URL and redirect URL and the password and email-confirmation settings (mirroring `supabase/config.toml`), created the Stripe test-mode webhook endpoint, and added `STRIPE_WEBHOOK_SECRET` to Vercel Production. `main` was then redeployed so the variables took effect.

**Spoofing test:** `abuse-001-live-test.py`.

**Rollback:** merge B (PR #21) shipped one visible line. It was rolled back with `vercel rollback`, and this PR reverts the line in git.

**Uptime monitor:** a Sentry uptime monitor checks `/api/health` every minute, with an alert that emails the owner by name.

**Rotation inside a controlled outage**

1. Production's secret key was set to a fake value and redeployed, so `/api/health` returned 503.
2. The alert fired.
3. `vercel_production_2` was swapped in and redeployed.
4. `vercel_production` was deleted.

## 6. After

| What | Evidence | Result |
| --- | --- | --- |
| Main deploys to production only after CI | `pipeline.md` | Both main deployments (A `177aead`, B `5d28546`) sat **STAGED** until CI on main passed, then were promoted: 12:59:47 build → 13:00:11 staged → 13:01:33 CI green → 13:01:44 promoted |
| **First deployment** | `pipeline.md` | **DELIV-002:** the project's first Git deployment, from PR #20's branch, was promoted to production at 12:57:44, **41 s before CI finished** (12:58:25, green). Vercel made it production because the project had none yet. Content identical to merge A. Closed: it can't recur here |
| Signed-out smoke test | `smoke-signed-out.txt` | Health 200 (`database: ok`); CSP with nonce, HSTS, X-Frame-Options, nosniff, Referrer-Policy and Permissions-Policy present; protected pages 307 to login; brief API 401; cross-site POST 403; unsigned webhook 400 |
| Signed-in smoke test | `smoke-signed-in.md` | Sign-in, onboarding (`create_workspace()`), the subscription gate, Stripe test checkout and the live webhook, adding a client and a note: all worked. **Sign-up form not testable:** Supabase rejects `example.com` at public sign-up, and the built-in email delivers only to org members (EMAIL-001, Gate 2). The form's "Please try again" for a rejected address is UX-001 |
| ABUSE-001 on the live app | `abuse-001-live.txt` | Attempt 21 hit the per-IP limit. Then **10 of 10** attempts with a new forged `X-Forwarded-For`, `X-Real-IP` and `x-vercel-forwarded-for` were still limited. **Acceptance closed** |
| Rollback | `rollback.md` | Bad release live at 15:41:33, `vercel rollback` at 15:41:44, done in **3 s**, gone from the page at 15:41:51: **live about 20 s** |
| Uptime alert | `uptime-outage-rotation.md` | Outage 15:23:12 → 15:31:36 (**8 min 24 s**). Downtime email at 15:26 (**about 3 min**; two emails, from this alert and the Lab 9 rule); resolved email at 15:32 |
| Rotation | `uptime-outage-rotation.md` | `vercel_production` → `vercel_production_2` on **Nov 24**: new key in, deployed, health 200, then the old key deleted |
| CI | PR checks | Green on every merged commit. PR #21 first failed lint (an unescaped `"` in JSX, my mistake); branch protection would have blocked it, and the fix was pushed before merging |

## 7. Evidence kept

`evidence/lab-10/`: `pipeline.md`, `smoke-signed-out.txt`, `smoke-signed-in.md`, `abuse-001-live.txt`, `rollback.md`, `uptime-outage-rotation.md`.

No key values are in any of them: the fake key in the outage was a made-up string, and the owner's test password was never seen by the agent. Screenshots for the posts (before, bad release, after rollback) are kept outside the repo, in `post-screenshots/lab-10/`.

## 8. Done when

- [x] Main deploys to production, pull requests get previews, and the framework is Next.js.
- [x] Production waits for CI on main (seen twice). The first deployment didn't, recorded as DELIV-002.
- [x] `APP_URL`, Auth URLs and `STRIPE_WEBHOOK_SECRET` in place; signed-out and signed-in smoke tests passed.
- [ ] A test sign-up through the form. Blocked by Supabase's built-in email (EMAIL-001, Gate 2).
- [x] Spoofed headers don't change the rate-limit bucket on the live app; ABUSE-001 acceptance closed.
- [x] One rollback performed and timed.
- [x] Uptime monitor fired once and reached the owner; recovery also notified.
- [x] `vercel_production` rotated, with dates.

## Relaxations used in this lab: 3

| Merge | PR | Why it needed one |
| --- | --- | --- |
| A | #20 (`vercel.json`, first production deploy) | Required Code Owner review; the only Code Owner is the PR's author |
| B | #21 (the rollback test's visible change) | Same |
| C | this PR (write-up, and reverting B in git) | Same |

Each was approved by the owner in chat, with CI green first. Admin enforcement was off for about 4–5 seconds each time, and the timestamps are in each PR's comment.

Three exceptions in one lab is the cost of the agent acting as the owner: getting a change to production through the pipeline needs a merge, and every merge needs an approval the agent can't give. That's the evidence for AGENT-001, a separate identity for the agent so a human approves its PRs normally (Gate 2).

## Open after this lab

- **After the rollback, Vercel turned off automatic promotion.** This PR's production deployment has to be promoted by hand (`vercel promote`), which turns it back on. That's recorded in the PR comment.
- **Preview deployments have no `APP_URL`.** Sign-up links from a preview would point at localhost. Previews also build Dependabot branches with the Preview secrets.
- **Gate 2 still open:**
  - hosted restore into a separate project;
  - dependency checks in CI;
  - AGENT-001 (the agent's own identity);
  - SECRETS-003 (per-environment Stripe and Anthropic keys);
  - OBS-003 (free text reaching Sentry);
  - **EMAIL-001** (custom email provider);
  - **UX-001** (sign-up message for a rejected address);
  - **OBS-005** (Vercel Hobby keeps runtime logs about an hour).
- **Two alert rules** email the owner for the same issue (this one and Lab 9's): a duplicate, noted since Lab 9.
- **Sentry says uptime check data may be stored outside the selected data region.** Recorded in the subprocessor list.
