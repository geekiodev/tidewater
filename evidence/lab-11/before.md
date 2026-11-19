# Lab 11 before: every secret the app uses, where it lives, who can read it

Nov 19, 2026, branch `lab-11-secrets` at `d2feba7` (main). Names only: no value, prefix or fragment of any secret is recorded here.

## What the app reads (`src/lib/env.ts`)

| Variable | Secret? | Where it lives today | Who can read it there |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | No: public by design (RLS protects data), but a **legacy** JWT key | `.env.local` on the owner's laptop | See "The file" below |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes**: bypasses RLS. **Legacy** JWT key | `.env.local` | See below |
| `STRIPE_SECRET_KEY` | **Yes** (test mode, `sk_test_` enforced) | `.env.local` | See below |
| `STRIPE_WEBHOOK_SECRET` | **Yes** | `.env.local`; value printed by `stripe listen` for local forwarding only | See below |
| `ANTHROPIC_API_KEY` | **Yes** (key `tidewater-lab`, "Tidewater lab" workspace, $5/month limit) | `.env.local` | See below |
| `SENTRY_DSN` | Low: lets anyone send events to the project | `.env.local` | See below |
| `APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_TEAM`, `ANTHROPIC_MODEL`, `AI_MONTHLY_BRIEF_LIMIT` | No (configuration) | `.env.local` | |
| `TEST_DATABASE_URL` | No: local throwaway database with the well-known local password | `.env.local`; CI sets its own in the workflow file | |

## In the same file, but not used by the app

| Variable | What it is | Note |
| --- | --- | --- |
| `SUPABASE_ACCESS_TOKEN` | Supabase personal access token for the CLI and Management API | Scoped: it can't list organizations or projects (403), can't read pooler settings (403), and is read-only for API keys. Not used by the app; it sits beside the app's secrets because the CLI reads it |
| `SENTRY_AUTH_TOKEN` | Sentry API token used in Lab 9 | Revoked Nov 10, so the value is dead, but it is still in the file |

## The file

- **`.env.local`**, git-ignored (`.gitignore` covers `.env*`); `.env.example` (dummy values) is the only env file tracked. gitleaks found no secret in history (baseline re-run, Nov 11).
- **Permissions were `-rw-r--r--`**: readable by every account on the laptop, not just the owner. Changed to `-rw-------` in this lab.
- **Readers:** the owner's macOS account, and every process running as it, which includes the AI coding agents working in this repo.
- **No rotation record** for any key, no expiry except the Anthropic key's (Jan 1, 2027), and no second copy anywhere: no hosting platform, no secret manager.
- **No GitHub Actions secrets** (`gh secret list`: none). CI needs none: it uses a throwaway Postgres service container.

## Accounts that can see the same secrets at the source

| Provider | Where | Members |
| --- | --- | --- |
| Supabase | Hosted project `tidewater-staging` (`kbvdwgqbfrrfhwdqrgyw`, us-east-2), created by the owner for this lab | Not checkable with the scoped token (organization read: 403). Owner to confirm in the dashboard |
| Stripe | "The Geekio Project LLC" sandbox | Owner; not checked from here |
| Anthropic | "Tidewater lab" workspace | Owner; not checked from here |
| Sentry | Org `the-geekio-project` | Owner (Lab 9: the only active member) |

## Legacy Supabase keys

The app is built on the **legacy** key pair: `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`anon`) and `SUPABASE_SERVICE_ROLE_KEY` (`service_role`), both long-lived JWTs signed with the project's JWT secret. They can't be rotated without rotating the JWT secret, which signs every user session too (KEYS-001).

Used in `src/lib/env.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts`, `src/proxy.ts`, `tests/unit/access-control.test.ts`, `audit/baseline.sh`, `.env.example` and `README.md`.

The hosted project has both kinds of key: `anon` and `service_role` (type `legacy`), plus a `default` publishable key and a `default` secret key. The local stack (`supabase status`) also offers `PUBLISHABLE_KEY` and `SECRET_KEY` next to `ANON_KEY` and `SERVICE_ROLE_KEY`.

## Client IP for rate limits (ABUSE-001)

`clientIp()` took the first entry of `X-Forwarded-For`, falling back to `X-Real-IP`: both can be sent by any client.
