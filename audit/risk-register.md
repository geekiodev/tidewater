# Risk register: Tidewater, from the baseline

Built Oct 29, 2026 from `audit/findings.json` (baseline of `v0-as-built`, commit `70c8ac6`, run Oct 26), plus CHANGE-003, found the same day from the repo's first CI run on GitHub. Owner of every entry: @geekiodev.

**Target:** L3 before the hardened version takes real customer data ("first deploy"). The as-built version is never deployed.

**How each finding was decided**

1. A finding that blocks the next level gets fixed first, in a lab, with a date.
2. A finding whose risk only becomes real once there's a hosted deployment with customer data gets fixed before first deploy, tied to that event rather than to a calendar date.
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
| OBS-001: errors go to stderr only | G2.4 (L2 blocker) | High | Fix | Lab 9: error tracker wired in, test event recorded | Nov 8 |
| OBS-002: no alert reaches a named person | G3.3 | High | Fix | Lab 9: uptime check on /api/health, alerts to the owner | Nov 8 |
| SUBPROC-001: no subprocessor list | G4.9 (L4, pulled forward) | Medium | Fix | Subprocessor list for Supabase, Stripe, Anthropic, Sentry and hosting (Sentry recorded below) | Nov 12 |

## Fix before first deploy

| Finding | Gate | Severity | Decision | Closes with | Due |
| --- | --- | --- | --- | --- | --- |
| DELIV-001: no deploy pipeline or tested rollback | G3.4 | High | Fix | Lab 10: pipeline with preview deploys, one rollback performed | Before first deploy |
| SECRETS-001: secrets in local .env files | G3.7 | High | Fix | Lab 11: platform secret store, per-person access, rotation record | Before first deploy |
| KEYS-001: legacy Supabase anon and service_role keys | G3.7 | Low | Fix | Lab 11: the new hosted project uses publishable and secret keys | Before first deploy |
| OBS-002 (uptime): nothing watches `/api/health` | G3.3 | High | Fix | Uptime check on the deployed `/api/health`, alerting the owner; can't exist until there is a deployment | Before first deploy |
| OBS-003: free text in error messages passes the scrubber, reaches Sentry and is copied into alert emails | G2.4 | Medium | Fix | Report errors with fixed messages and send identifiers as context, or drop the message for unknown error types; test that a note's text never reaches Sentry | Before first deploy |
| OBS-004: Sentry stores an approximate location for each event | G2.4 | Low | Fix | Turn on "Prevent storing of IP addresses" in the Sentry project and check a new event has no `user.geo` | Before first deploy |
| ABUSE-001 (at expiry): client IP from a header clients can set | G2.5 | Medium | Fix | Read the client IP only from the hosting platform's trusted header; test with a spoofed header | Before first deploy |
| DEPS-001: audit results differ by environment | G3.6 | Low | Fix | Lab 2: npm audit in CI on a schedule, dated output kept | Before first deploy |

DATA-001 and DATA-002 are re-run against the hosted database before first deploy; the local drill proves the procedure, not the hosted backups. The re-drill confirms the hosted backup frequency meets the 24-hour RPO, restores a hosted backup into a new, separate project with `labs/05-restore-drill/`'s comparison queries, and times it end to end against the 4-hour RTO.

## Accepted

| Finding | Gate | Severity | Decision | Compensating control | Expires |
| --- | --- | --- | --- | --- | --- |
| ABUSE-001: per-IP rate limits trust X-Forwarded-For | G2.5 (passes) | Medium | Accept, with conditions | No exposure while the app is undeployed. The per-email login limit covers brute force against one account, but not password spraying or sign-up abuse | First deploy, or Dec 31, 2026, whichever comes first |

Full record: [`audit/acceptances/ABUSE-001.md`](acceptances/ABUSE-001.md).

## Subprocessors

Started with Lab 9; the rest of the list closes SUBPROC-001.

| Subprocessor | Purpose | Data sent | Region | Added |
| --- | --- | --- | --- | --- |
| Sentry (Functional Software, Inc.), org `the-geekio-project`, project `javascript-nextjs` | Server error tracking and new-issue email alerts | Scrubbed error events only: error name, scrubbed message, stack frames (file paths and line numbers), and context the reporter allows (route, method, digest; personal-data keys replaced with `[redacted]`), plus Node.js version and environment. Not sent: request headers, cookies, bodies, query strings, user identity, IP address or server hostname. Sentry still sees the sending server's IP when events arrive and derives an approximate location from it (OBS-004). Free text inside an error message can get through (OBS-003) | US (`us.sentry.io`) | Nov 10, 2026 |

## Still to assess

G2.1 (server-side authorization), G2.6 (input validation) and G3.6 (dependency patching) were left pending by the baseline. Manual review by Nov 8, owner @geekiodev. L2 needs G2.1 and G2.6 to pass, so the level after Arc 1 depends on this review as well as on the labs.

## Where this leaves the level

| | Level | What stands in the way |
| --- | --- | --- |
| Now (Nov 11) | L1 | G2.1 and G2.6, still to be reviewed. G2.7 (Lab 3), G2.4 (Lab 9) and G2.3 (Lab 5) are closed |
| After Arc 1 (Nov 12) | L2, if G2.1 and G2.6 pass review | G3.4, G3.7 |
| First deploy | L3 target | Nothing open: ABUSE-001's acceptance ends and its fix is due the same day |

## Sign-off

Launch sign-off happens before first deploy, against this register as it stands then: every "fix" closed with evidence, and every acceptance renewed or closed. On this project the owner who fixes and the person who accepts are the same person, which a reviewer would flag as a gap in separation of duties. That's recorded here rather than hidden.

Maps to: NIST 800-53 RA-3, RA-7 and CA-5 (plan of action and milestones); ISO 27001:2022 clause 6.1.3 (risk treatment); SOC 2 CC9.1.

## Change log

- Oct 29: added CHANGE-003. The first CI run on GitHub (triggered when the repo went public) failed before any job started: line 60 of `.github/workflows/ci.yml` holds an unquoted step name containing `: `, which YAML parses as a mapping, so GitHub rejects the whole file. Type check, lint, tests and build have never run in CI, on any commit or Dependabot pull request. The baseline missed it because it only checked that the workflow file existed. The next baseline run validates the workflow as well.
- Nov 5: wrote the ABUSE-001 acceptance record. Testing the compensating control against each path showed it covers brute force against one account but not password spraying or sign-up abuse, so the register now says so, the acceptance gained a calendar expiry (Dec 31, 2026), and the fix joined the "before first deploy" list.
- Nov 10: Lab 9 wired Sentry in behind the scrubber and added a new-issue email alert (OBS-001 closed; OBS-002 closed for errors, with uptime monitoring moved to "before first deploy" because there's no deployment to watch). Found while doing it: the agent's documented way to add an error tracker (`setErrorSink()` at startup) never reached the routes, because Next.js bundles instrumentation separately; fixed in the lab. Also found OBS-003 (free text in error messages reaches Sentry) and OBS-004 (Sentry stores an approximate location from the sender's IP). Sentry added as the first entry on the subprocessor list.
- Nov 11: Lab 5 set RTO 4 hours and RPO 24 hours (committed before the drill), seeded every Tidewater table with `@example.com` dummy data, and restored a `pg_dump` of the local database into an empty scratch database: 64 of 64 tables matched on row count, the 9 Tidewater tables on content, and 70 RLS flags, policies, triggers, functions and grants were identical. DATA-001 and DATA-002 closed for the local database; the hosted re-drill stays as the note under "Fix before first deploy". Three days past the Nov 8 due date. The "Now" row under "Where this leaves the level" brought up to date: it still listed G2.4 and G2.7, closed by Labs 9 and 3.
