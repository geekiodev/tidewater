# Risk register: Tidewater, from the baseline

Built Oct 29, 2026 from `audit/findings.json` (baseline of `v0-as-built`, commit `70c8ac6`, run Oct 26). Owner of every entry: @geekiodev.

**Target:** L3 before the hardened version takes real customer data ("first deploy"). The as-built version is never deployed.

**How each finding was decided**

1. A finding that blocks the next level gets fixed first, in a lab, with a date.
2. A finding whose risk only becomes real once there's a hosted deployment with customer data gets fixed before first deploy, tied to that event rather than to a calendar date.
3. A finding we choose to live with is accepted only with an owner, an expiry and a compensating control.
4. Card data is already transferred by design: Stripe's hosted checkout means card numbers never touch Tidewater, which typically keeps PCI DSS scope to SAQ A. That's a treatment chosen before the build, so it isn't a finding here.

## Fix during Arc 1 (by Nov 12)

| Finding | Gate | Severity | Decision | Closes with | Due |
| --- | --- | --- | --- | --- | --- |
| CHANGE-001: CI can't block a merge | G2.7 (L2 blocker) | High | Fix | Lab 3: branch protection requiring CI | Oct 31 |
| CHANGE-002: CODEOWNERS placeholder, review not enforced | G3.8 | High | Fix | Lab 3: real owner, Code Owner review required | Oct 31 |
| DOCS-001: README behind reality | Docs | Low | Fix | Its own pull request | Oct 31 |
| DATA-001: no backup has ever been restored | G2.3 (L2 blocker) | High | Fix | Lab 5: timed restore drill on the local database | Nov 8 |
| DATA-002: no restore drill against RTO and RPO | G3.5 | High | Fix | Lab 5: RTO and RPO stated and measured | Nov 8 |
| OBS-001: errors go to stderr only | G2.4 (L2 blocker) | High | Fix | Lab 9: error tracker wired in, test event recorded | Nov 8 |
| OBS-002: no alert reaches a named person | G3.3 | High | Fix | Lab 9: uptime check on /api/health, alerts to the owner | Nov 8 |
| SUBPROC-001: no subprocessor list | G4.9 (L4, pulled forward) | Medium | Fix | Subprocessor list for Supabase, Stripe, Anthropic and hosting | Nov 12 |

## Fix before first deploy

| Finding | Gate | Severity | Decision | Closes with | Due |
| --- | --- | --- | --- | --- | --- |
| DELIV-001: no deploy pipeline or tested rollback | G3.4 | High | Fix | Lab 10: pipeline with preview deploys, one rollback performed | Before first deploy |
| SECRETS-001: secrets in local .env files | G3.7 | High | Fix | Lab 11: platform secret store, per-person access, rotation record | Before first deploy |
| KEYS-001: legacy Supabase anon and service_role keys | G3.7 | Low | Fix | Lab 11: the new hosted project uses publishable and secret keys | Before first deploy |
| DEPS-001: audit results differ by environment | G3.6 | Low | Fix | Lab 2: npm audit in CI on a schedule, dated output kept | Before first deploy |

DATA-001 and DATA-002 are re-run against the hosted database before first deploy; the local drill proves the procedure, not the hosted backups.

## Accepted

| Finding | Gate | Severity | Decision | Compensating control | Expires |
| --- | --- | --- | --- | --- | --- |
| ABUSE-001: per-IP rate limits trust X-Forwarded-For | G2.5 (passes) | Medium | Accept | Per-email login limits stay in force; no deployment exists for the header to be spoofed against | First deploy, when the client IP must come from the platform's trusted header |

Full acceptance record (who accepted it, why, and what ends it) follows in Post 9.

## Still to assess

G2.1 (server-side authorization), G2.6 (input validation) and G3.6 (dependency patching) were left pending by the baseline. Manual review by Nov 8, owner @geekiodev. L2 needs G2.1 and G2.6 to pass, so the level after Arc 1 depends on this review as well as on the labs.

## Where this leaves the level

| | Level | What stands in the way |
| --- | --- | --- |
| Now | L1 | G2.3, G2.4, G2.7 |
| After Arc 1 (Nov 12) | L2, if G2.1 and G2.6 pass review | G3.4, G3.7 |
| First deploy | L3 target | Nothing open except the accepted ABUSE-001, which expires that day |

## Sign-off

Launch sign-off happens before first deploy, against this register as it stands then: every "fix" closed with evidence, and every acceptance renewed or closed. On this project the owner who fixes and the person who accepts are the same person, which a reviewer would flag as a gap in separation of duties. That's recorded here rather than hidden.

Maps to: NIST 800-53 RA-3, RA-7 and CA-5 (plan of action and milestones); ISO 27001:2022 clause 6.1.3 (risk treatment); SOC 2 CC9.1.
