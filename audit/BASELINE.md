# Baseline: Tidewater at v0-as-built

**Verdict: L1, target L3. Blocked from L2 by G2.3 (backups and a performed restore), G2.4 (error tracker) and G2.7 (CI that can block a merge).**

Audited commit `70c8ac6` (tag `v0-as-built`) on Oct 26, 2026, against the App Readiness Audit v0.1. This is phase 1: what tools can decide, plus gate statuses the evidence already settles. Manual review (phase 2) comes next.

## Gates in scope (23, plus G4.9 pulled forward)

| Result | Gates |
| --- | --- |
| Pass (12) | G1.1, G1.2, G1.3, G1.4, G2.2, G2.5, G2.8, G3.1, G3.2, G3.9, G3.10, G3.11 |
| Fail (8) | G2.3, G2.4, G2.7, G3.3, G3.4, G3.5, G3.7, G3.8 |
| Pending phase 2 (3) | G2.1, G2.6, G3.6 |
| Pulled forward from L4 | G4.9 fails: data flows are documented, but there's no subprocessor list |

Every failing gate is operational: backups, error tracking, merge protection, alerting, deploys and rollback, restore drills, secrets management, enforced human review. Every code-level gate checked so far passes.

## What the tools found

- **Secrets (G1.1):** gitleaks over the full history and the built client bundle found nothing; the one agent instruction file (AGENTS.md) holds no secrets; only `.env.example` is tracked.
- **Build and tests (G1.4, G3.2):** a fresh clone installs, type-checks, lints with zero warnings and builds. All 122 tests pass, 48 of them against real Postgres.
- **Running app (G1.2, G3.9):** signed-out pages redirect to login, the API returns 401, every response carries a nonce-based CSP and HSTS, and a cross-site POST gets 403.
- **AI-era patterns:** no switched-off safety checks (AI-02), no stubs, mock data or empty catch blocks (AI-01).
- **Dependencies (G1.3, G3.6):** no critical advisories. The same lockfile showed 5 high (dev-only lint tooling) on macOS on Oct 20 and 0 here on Oct 26, which is itself a finding: dependency evidence needs a date and a place.

## Findings

13 findings: 8 High (one per failing gate), 2 Medium, 3 Low. Full records, with location, failure scenario, fix and effort, are in `findings.json`.

## Run it yourself

```
TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54322/tidewater_test bash audit/baseline.sh
```

Run it from `main`, which is `v0-as-built` plus this `audit/` folder and nothing else (`git diff v0-as-built --stat` shows only `audit/`). Needs Node 22, git, gitleaks (`brew install gitleaks`) and a running local Supabase (`npx supabase start`) or the separate Postgres described in the README. Evidence lands in `audit/out/<timestamp>/`.
