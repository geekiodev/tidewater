# Baseline re-run, Nov 11, 2026

`summary.txt` is the output of `audit/baseline.sh`, run unchanged on branch `review-g2.1-g2.6` at `ccbc9bd` (main at `635b5ed` plus the G2.1/G2.6 review). Command:

    TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54322/tidewater_test bash audit/baseline.sh

Run on macOS (Apple M1 Pro) with Node 22, gitleaks 8.30.1, actionlint, and the local Supabase Postgres (17.11) for the database tests. The full raw output (logs, audit JSON, headers) stayed in `audit/out/`, which isn't committed, the same as for the Oct 26 run.

## What changed since the baseline (`../cloud-run-20261026-summary.txt`)

| Check | Oct 26 (`v0-as-built`) | Nov 11 | Why |
| --- | --- | --- | --- |
| G3.2 tests | 122 passed | 125 passed | Lab 9 added 3 Sentry sink tests |
| G1.3 npm audit (all) | 0 | 8 moderate, all dev-only | One advisory in `minimatch` (denial of service via glob patterns), reached through `eslint-config-next` → `typescript-eslint`. Lint tooling only; production dependencies still 0. For G3.6 (still pending) |
| G3.8 CODEOWNERS owners | `@tidewater-maintainers-placeholder` | `@geekiodev` | Lab 3 |
| G2.7 CI workflow valid | not checked | valid (actionlint) | Check added in Lab 3 after CHANGE-003 |

Everything else is unchanged. The health endpoint reports `database: not_configured` by design: the script starts the production build with a dummy Supabase key, so the probes test the app's own behaviour without real credentials.
