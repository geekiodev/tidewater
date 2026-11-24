# Risk register: Tidewater, from the baseline

Built Oct 29, 2026 from `audit/findings.json` (baseline of `v0-as-built`, commit `70c8ac6`, run Oct 26), plus CHANGE-003, found the same day from the repo's first CI run on GitHub. Owner of every entry: @geekiodev.

**Target:** L3 before the first real customer (Gate 2). The first deploy (Gate 1) is to staging with test data only. The as-built version is never deployed.

**How each finding was decided**

1. A finding that blocks the next level gets fixed first, in a lab, with a date.
2. A finding whose risk only becomes real once there's a hosted deployment is tied to that event rather than to a calendar date: Gate 1 (before first deploy) or Gate 2 (before first real customer).
3. A finding we choose to live with is accepted only with an owner, an expiry and a compensating control.
4. Card data is already transferred by design: Stripe's hosted checkout means card numbers never touch Tidewater, which typically keeps PCI DSS scope to SAQ A. That's a treatment chosen before the build, so it isn't a finding here.

## Fix during Arc 1 (by Nov 12)

| Finding | Gate | Severity | Decision | Closes with | Due |
| --- | --- | --- | --- | --- | --- |
| CHANGE-003: CI workflow file is invalid YAML; no CI check has ever run | G2.7 (L2 blocker) | High | Fix | Lab 3: fix the workflow first, so there is a check for branch protection to require | Oct 31 |
| CHANGE-001: CI can't block a merge | G2.7 (L2 blocker) | High | Fix | Lab 3: branch protection requiring CI | Oct 31 |
| CHANGE-002: CODEOWNERS placeholder, review not enforced | G3.8 | High | Fix | Lab 3: real owner, Code Owner review required | Oct 31 |
| DOCS-001: README behind reality | Docs | Low | Fix | Its own pull request | Oct 31 |
| DATA-001: no backup has ever been restored | G2.3 (L2 blocker) | High | Fix | Lab 5: timed restore drill on the local database. **Closed Nov 11** (local): 64 of 64 tables restored, data and access controls identical | Nov 8 |
| DATA-002: no restore drill against RTO and RPO | G3.5 | High | Fix | Lab 5: RTO and RPO stated and measured. **Closed Nov 11** (local): RTO 4 h, RPO 24 h set first; technical restore 1.4 s; RPO needs hosted backups | Nov 8 |
| OBS-001: errors go to stderr only | G2.4 (L2 blocker) | High | Fix | Lab 9: error tracker wired in, test event recorded. **Closed Nov 10**: server errors reach Sentry only through the scrubber | Nov 8 |
| OBS-002: no alert reaches a named person | G3.3 | High | Fix | Lab 9: uptime check on /api/health, alerts to the owner. **Closed Nov 10 for errors**: a new Sentry issue emails the owner. Uptime moved to "before first deploy" | Nov 8 |
| SUBPROC-001: no subprocessor list | G4.9 (L4, pulled forward) | Medium | Fix | Subprocessor list for Supabase, Stripe, Anthropic, Sentry and hosting (Sentry recorded below) | Nov 12 |
| AUTHZ-001: a member can delete other people's notes by deleting the client | G2.1 (L2 blocker) | Medium | Fix | Owner-only client deletion (RLS and `requireOwner()`), or only when no one else has notes on it; database test for the cascade. Found in the Nov 11 review. **Closed Nov 11**: owner-only delete in RLS and in the action; a member's delete is refused (test) | Nov 12 |
| VALID-001: the Supabase Data API accepts values the zod schemas reject | G2.6 (L2 blocker) | Low | Fix | Format rules as database check constraints, or no direct insert and update grants for signed-in users; test through the Data API. Found in the Nov 11 review. **Closed Nov 11**: check constraints for website, email and phone matching zod; the probe values are refused (tests) | Nov 12 |

## Gate 1: before first deploy

Set Nov 19 (Post 12). The first deploy is to staging (`tidewater-staging`), with test data only. **Gate 1 passed Nov 24 (Lab 10)**: production at https://tidewater-bice.vercel.app, deployed from main.

| Finding | Gate | Severity | Decision | Closes with | Status |
| --- | --- | --- | --- | --- | --- |
| SECRETS-001: secrets in local .env files | G3.7 | High | Fix | Lab 11: secrets in Vercel, one sensitive variable per environment, names and access recorded, one rotation | **Closed Nov 19.** Every secret is a Secret-type variable in the Vercel project `tidewater`, added separately for Production and Preview; Supabase secret keys differ per environment; the `default` secret key deleted the same night (rotation). See Gate 2 for the reused Stripe and Anthropic keys |
| KEYS-001: legacy Supabase anon and service_role keys | G3.7 | Low | Fix | Lab 11: publishable and secret keys in code, docs and Vercel | **Closed Nov 19.** The app refuses a legacy key at startup |
| SECRETS-002: `.env.local` was readable by every account on the laptop | G3.7 | Medium | Fix | Owner-only permissions | **Closed Nov 19** (found and fixed in Lab 11) |
| ABUSE-001: client IP from a header clients can set | G2.5 | Medium | Fix | `clientIp()` reads only `x-vercel-forwarded-for`, only on Vercel; spoofed `X-Forwarded-For` ignored (test) | **Closed Nov 24** (Lab 10). On the live app the per-IP login limit refused attempt 21, then 10 of 10 attempts with a new forged `X-Forwarded-For`, `X-Real-IP` and `x-vercel-forwarded-for` each were still refused. Acceptance closed |
| DELIV-001 (part 1): no deploy pipeline that can roll back | G3.4 | High | Fix | Lab 10: pipeline with preview deploys and a rollback path | **Closed Nov 24.** Vercel project connected to `geekiodev/tidewater`: main deploys to production, pull requests get previews. A Deployment Check holds each production deployment until CI ("Type check, lint, test, build") passes on main, seen twice |
| DELIV-002: the project's first Git deployment, from a PR branch, was promoted to production before CI finished | G3.4 | Medium | Fix | Record it; on a new project, make the first production deployment from main | **Closed Nov 24** (found in Lab 10). Live 41 s before CI passed on the same commit; content identical to what merge A shipped. Can't recur on this project now that production exists |

Done at the first deploy (Nov 24): `vercel_production` rotated to `vercel_production_2`, old key deleted; `STRIPE_WEBHOOK_SECRET` (added by the owner) and `APP_URL` set for Production; Auth Site URL, redirect URLs and the password and email-confirmation settings from `supabase/config.toml` set by the owner in the dashboard; framework set to Next.js in `vercel.json`.

## Gate 2: before first real customer

| Finding | Gate | Severity | Decision | Closes with | Status |
| --- | --- | --- | --- | --- | --- |
| DELIV-001 (part 2): no rollback has ever been performed | G3.4 | High | Fix | One rollback performed on the deployed app and recorded | **Closed Nov 24** (Lab 10). A visible change went live through the pipeline and was rolled back with `vercel rollback` in 3 s; the bad version was live about 20 s |
| OBS-002 (uptime): nothing watches `/api/health` | G3.3 | High | Fix | Uptime check on the deployed `/api/health`; one alert fired and reached the owner | **Closed Nov 24** (Lab 10). Sentry uptime monitor every minute; a controlled 8 min 24 s outage emailed the owner after about 3 min, and the resolved email came within a minute of recovery |
| DATA-001, DATA-002 (hosted): the restore drill ran on the local database only | G2.3, G3.5 | High | Fix | Hosted backup frequency meets the 24-hour RPO; a hosted backup restored into a new, separate project, compared with `labs/05-restore-drill/`'s queries, and timed against the 4-hour RTO | Open |
| DEPS-001: audit results differ by environment | G3.6 | Low | Fix | Dependency checks in CI (`npm audit` on a schedule, dated output kept) | Open |
| AGENT-001: the AI agent works under the owner's identity | G3.8 | Medium | Fix | The agent gets its own GitHub, Vercel and Supabase identities with only the access it needs, so its changes are attributable and it can't approve or merge its own work | Open. Today the agent uses the owner's `gh`, Vercel CLI login and `.env.local`; Lab 11 kept its access to reading keys a human created, and the human applied the schema |
| SECRETS-003: staging reuses the local-development Stripe and Anthropic test keys | G3.7 | Medium | Fix | Separate Stripe (restricted) and Anthropic keys for Production and Preview, none shared with local development | Open. The Stripe test key and the Anthropic `tidewater-lab` key in Vercel are the same values as in `.env.local`, for staging only; they must be replaced with per-environment keys before the first real customer |
| OBS-003: free text in error messages passes the scrubber, reaches Sentry and is copied into alert emails | G2.4 | Medium | Fix | Report errors with fixed messages and send identifiers as context, or drop the message for unknown error types; test that a note's text never reaches Sentry | Open |
| EMAIL-001: the hosted project uses Supabase's built-in email, which only delivers to the org's members | Operations (no rubric gate) | High | Fix | A custom email provider (SMTP) for Supabase Auth, tested with a real sign-up and confirmation | Open (found in Lab 10). Public sign-up also rejects `example.com` addresses outright, so the sign-up form couldn't be tested end to end; nobody outside the org can sign up today |
| UX-001: sign-up says "Please try again" when Supabase rejects the email address | Usability (no rubric gate) | Low | Fix | Map `email_address_invalid` to a field error on the email, with a test | Open (found in Lab 10) |
| OBS-005: Vercel Hobby keeps runtime logs for about an hour | G3.3 | Low | Fix | A log drain, or a plan with longer retention, so an incident can be investigated after the fact | Open (found in Lab 10) |

Closed before the gates were set: OBS-004 (Sentry stores an approximate location), closed Nov 10 by the owner turning on "Prevent storing of IP addresses".

## Accepted

| Finding | Gate | Severity | Decision | Compensating control | Expires |
| --- | --- | --- | --- | --- | --- |
| ABUSE-001: per-IP rate limits trust X-Forwarded-For | G2.5 (passes) | Medium | ~~Accept, with conditions~~ **Closed Nov 24** | Fix merged in Lab 11 (Nov 19) and confirmed on the deployed app in Lab 10: forged headers don't change the rate-limit bucket | Closed at first deploy, Nov 24 |

Full record: [`audit/acceptances/ABUSE-001.md`](acceptances/ABUSE-001.md).

## Subprocessors

Started with Lab 9; the rest of the list closes SUBPROC-001.

| Subprocessor | Purpose | Data sent | Region | Added |
| --- | --- | --- | --- | --- |
| Sentry (Functional Software, Inc.), org `the-geekio-project`, project `javascript-nextjs` | Server error tracking and new-issue email alerts | Scrubbed error events only: error name, scrubbed message, stack frames (file paths and line numbers), and context the reporter allows (route, method, digest; personal-data keys replaced with `[redacted]`), plus Node.js version and environment. Not sent: request headers, cookies, bodies, query strings, user identity, IP address or server hostname. Sentry still sees the sending server's IP when events arrive; since Nov 10 the project is set not to store IP addresses (OBS-004, closed). Free text inside an error message can get through (OBS-003). Since Nov 24 it also runs an uptime check on `/api/health`; Sentry says uptime check data may be stored outside the selected data region | US (`us.sentry.io`); uptime check data possibly elsewhere | Nov 10, 2026 |
| Supabase, Inc., project `tidewater-staging` (`kbvdwgqbfrrfhwdqrgyw`) | Hosted database and Auth for staging | Schema only so far (applied Nov 19); no customer data until Gate 2 | US East (`us-east-2`) | Nov 19, 2026 |
| Vercel Inc., project `tidewater` (team `geekiodevs-projects`, Hobby) | Hosting (from the first deploy) and the store for production and preview secrets | Environment variables (Secret-type values are write-only); since Nov 24 every request and the app's server-side processing, and runtime logs (about an hour on Hobby) | Functions region `iad1` (US East) | Nov 19, 2026 |

## Still to assess

G2.1 (server-side authorization) and G2.6 (input validation) were reviewed route by route on Nov 11 ([`review-g2.1-g2.6.md`](review-g2.1-g2.6.md)). Both failed on one path each (AUTHZ-001 and VALID-001 above). Both were fixed the same day, and both gates now pass. G3.6 (dependency patching) is still pending, owner @geekiodev.

## Where this leaves the level

| | Level | What stands in the way |
| --- | --- | --- |
| Now (Nov 24) | L2 | Gate 1 passed. G3.3 and G3.4 pass after Lab 10. L3 is held by G3.6 (dependency checks) and G3.8 (no second reviewer; the agent has no identity of its own) |
| Gate 2: first real customer | L3 target | Everything in the Gate 2 table closed |

## Sign-off

Launch sign-off happens before first deploy, against this register as it stands then: every "fix" closed with evidence, and every acceptance renewed or closed. On this project the owner who fixes and the person who accepts are the same person, which a reviewer would flag as a gap in separation of duties. That's recorded here rather than hidden.

Maps to: NIST 800-53 RA-3, RA-7 and CA-5 (plan of action and milestones); ISO 27001:2022 clause 6.1.3 (risk treatment); SOC 2 CC9.1.

## Change log

- Oct 29: added CHANGE-003. The first CI run on GitHub (triggered when the repo went public) failed before any job started: line 60 of `.github/workflows/ci.yml` holds an unquoted step name containing `: `, which YAML parses as a mapping, so GitHub rejects the whole file. Type check, lint, tests and build have never run in CI, on any commit or Dependabot pull request. The baseline missed it because it only checked that the workflow file existed. The next baseline run validates the workflow as well.
- Nov 5: wrote the ABUSE-001 acceptance record. Testing the compensating control against each path showed it covers brute force against one account but not password spraying or sign-up abuse, so the register now says so, the acceptance gained a calendar expiry (Dec 31, 2026), and the fix joined the "before first deploy" list.
- Nov 10: Lab 9 wired Sentry in behind the scrubber and added a new-issue email alert (OBS-001 closed; OBS-002 closed for errors, with uptime monitoring moved to "before first deploy" because there's no deployment to watch). Found while doing it: the agent's documented way to add an error tracker (`setErrorSink()` at startup) never reached the routes, because Next.js bundles instrumentation separately; fixed in the lab. Also found OBS-003 (free text in error messages reaches Sentry) and OBS-004 (Sentry stores an approximate location from the sender's IP). Sentry added as the first entry on the subprocessor list.
- Nov 11: Lab 5 set RTO 4 hours and RPO 24 hours (committed before the drill), seeded every Tidewater table with `@example.com` dummy data, and restored a `pg_dump` of the local database into an empty scratch database: 64 of 64 tables matched on row count, the 9 Tidewater tables on content, and 70 RLS flags, policies, triggers, functions and grants were identical. DATA-001 and DATA-002 closed for the local database; the hosted re-drill stays as the note under "Fix before first deploy". Three days past the Nov 8 due date. The "Now" row under "Where this leaves the level" brought up to date: it still listed G2.4 and G2.7, closed by Labs 9 and 3.
- Nov 11: the phase 2 review of G2.1 and G2.6 covered all 19 server actions, 4 route handlers and direct writes through the Supabase Data API. Both gates fail on one path each: AUTHZ-001 (a member can delete other people's notes by deleting the client) and VALID-001 (the Data API accepts values the zod schemas reject). Both added to "Fix during Arc 1" with a proposed Nov 12 due date. OBS-004 recorded as closed on Nov 10 ("Prevent storing of IP addresses" turned on in the Sentry project), and the Lab 9 Sentry auth token as revoked the same day, both as reported by the owner. OBS-001 and OBS-002 rows marked closed, as the Nov 10 entry already said. Re-audit: `audit/findings.json` brought up to date and the baseline script re-run (`audit/evidence/rerun-2026-11-11/`).
- Nov 11 (later): AUTHZ-001 and VALID-001 fixed in one pull request (migration `20261111000100`). Client deletion is now owner-only, in the RLS policy and in the action. Check constraints now mirror the zod format rules for website, email and phone; existing rows were checked against them first and all passed. Database tests show a member's delete is refused, the probe values are refused, and the database agrees with zod on 28 sample values. The two probes were re-run as "after" evidence. G2.1 and G2.6 pass, so the level is now L2.
- Nov 19: Lab 11. Secrets moved to Vercel (project `tidewater`, no Git integration, nothing deployed): each secret a Secret-type variable, added separately for Production and Preview. The app moved to Supabase publishable and secret keys and refuses legacy keys. The owner created the two Supabase secret keys (`vercel_production`, `vercel_preview`) and deleted the `default` secret key (the rotation); the agent only read keys and stored them. The owner applied the five migrations to `tidewater-staging` from their own terminal; the agent prepared the commands and verified the history. ABUSE-001 fixed in code (`x-vercel-forwarded-for` on Vercel only). SECRETS-001 and KEYS-001 closed; SECRETS-002 (world-readable `.env.local`) found and closed. The pre-deploy list restructured into Gate 1 (before first deploy) and Gate 2 (before first real customer), with AGENT-001 and SECRETS-003 added under Gate 2.
- Nov 24: Lab 10, the first deploy. The Vercel project was connected to GitHub: main deploys to production behind a Deployment Check on CI, and PRs get previews. Smoke tests passed signed out and signed in, including a Stripe test checkout and the live webhook. ABUSE-001 was confirmed on the live app and its acceptance closed. One rollback was performed on purpose, and a controlled outage fired the Sentry uptime alert. `vercel_production` was rotated to `vercel_production_2` during the recovery. DELIV-001, OBS-002 (uptime) and ABUSE-001 closed. Found: DELIV-002 (the first deployment, from a PR branch, went live before CI; closed), and EMAIL-001, UX-001 and OBS-005 under Gate 2. Three one-off relaxations were used in this one lab (merges A, B and C), the evidence behind AGENT-001.
