# Lab 11: secrets in a platform store, on the new Supabase keys

Closes SECRETS-001 and KEYS-001 (G3.7) and fixes ABUSE-001 in code (G2.5). Run Nov 19, 2026. Evidence is in [`evidence/lab-11/`](../../evidence/lab-11/).

**Who did what.** The human (@geekiodev) took every step that creates or applies something with real access:

- created the hosted project `tidewater-staging`;
- created both Supabase secret keys in the dashboard;
- deleted the `default` secret key;
- widened the Supabase access token;
- applied the schema from their own terminal.

The agent wrote the code, created the Vercel project and its variables, read the keys with a token that is read-only for API keys, and verified each step. No secret value, prefix or fragment is recorded anywhere in this lab.

## 1. The gates and why they matter

- **G3.7, secrets management (L3).** Production secrets live in a platform secret store, separate per environment, with access you can name and a rotation you can show. A key in a laptop file can't be rotated cleanly, and nobody can say who has it.
- **KEYS-001.** Supabase's legacy `anon` and `service_role` keys are JWTs signed with the project's JWT secret. Rotating them means rotating the secret that signs every user session. The new publishable and secret keys can each be created, rotated and deleted on their own.
- **ABUSE-001 (G2.5).** Per-IP rate limits are only as good as the IP. A header the client controls makes them decorative.

Maps to: NIST 800-53 IA-5 (authenticator management), SC-12 and SC-28 (key management, protection at rest), AC-6 (least privilege), SC-5 (denial-of-service protection, for the rate limits); SOC 2 CC6.1, CC6.3; ISO 27001:2022 A.5.17 (authentication information), A.8.24 (use of cryptography).

## 2. Starting point

`main` at `d2feba7`. Hosted Supabase project `tidewater-staging` (`kbvdwgqbfrrfhwdqrgyw`, us-east-2), created empty by the owner. Vercel CLI 65.4.0, logged in as `geekiodev` (one Hobby team). Supabase CLI 2.121.0, used with `SUPABASE_ACCESS_TOKEN` from `.env.local`; never `supabase login`, and the global login was left untouched.

## 3. The checks

```bash
# Names of what the app reads, and of what sits in .env.local (never values)
grep -oE '^[A-Z_]+=' .env.local
# Hosted keys: names and types only
curl -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" "https://api.supabase.com/v1/projects/kbvdwgqbfrrfhwdqrgyw/api-keys?reveal=false"
# Vercel variables: names, types and environments (Secret values show as Hidden)
vercel env ls
# Hosted migration history (read-only), and a signed-out read of each table
curl -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" https://api.supabase.com/v1/projects/kbvdwgqbfrrfhwdqrgyw/database/migrations
# ABUSE-001
npx vitest run tests/unit/client-ip.test.ts
```

## 4. Before

`before.md`:

- **Every secret lived in one file**, `.env.local` on the owner's laptop, readable by every account on the machine (`-rw-r--r--`).
- **The same file held two tokens the app doesn't use:** a Supabase personal access token, and the Sentry token revoked on Nov 10.
- **No copy anywhere else:** no platform store and no rotation record.
- **The app used the legacy key pair**, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`.
- **`clientIp()` took the first `X-Forwarded-For` entry**, falling back to `X-Real-IP`.

## 5. The fix

### Supabase keys (KEYS-001)

- `src/lib/env.ts` now reads `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`. It refuses any value without the `sb_publishable_` or `sb_secret_` prefix, so a legacy key can't be configured by mistake.
- `src/lib/supabase/server.ts`, `admin.ts`, `src/proxy.ts`, `tests/unit/access-control.test.ts`, `audit/baseline.sh`, `.env.example` and `README.md` all use the new names.
- Local development uses the local stack's publishable and secret keys. Checked: the publishable key is refused by RLS when signed out (42501), the secret key bypasses RLS, and `rate_limit_hit` works with it.

### Hosted project

- **The owner applied the five migrations** with `supabase db push --linked` from their own terminal, over the IPv4 pooler, typing the database password at a prompt. The agent prepared the commands and verified the result.
- **Why the agent didn't apply them:** the project's direct database address is IPv6-only and this network has none. The agent's token can read the pooler settings, but it has no database-write permission and no database password, by the owner's choice.
- **Verification** (`hosted-migrations.txt`): the hosted migration history lists the same five versions as `supabase/migrations/`.
- **Signed-out probe** (`hosted-signed-out-probe.txt`): a signed-out read of every table returns 42501, so each table exists and anonymous access is refused. A table that doesn't exist returns PGRST205, for contrast.

### Vercel (SECRETS-001)

- **Project:** `tidewater` was created with the CLI from an empty folder outside the repo, so no Git integration could be connected. Nothing has been deployed (`vercel ls`: no deployments).
- **Variables** (`vercel-env.txt`): every variable was added **separately for Production and for Preview**. Values were piped to the CLI on stdin and never printed.

| Variable | Type | Production | Preview | Source |
| --- | --- | --- | --- | --- |
| `SUPABASE_SECRET_KEY` | Secret | key `vercel_production` | key `vercel_preview` | Created by the owner in the Supabase dashboard; read by the agent with the token (read-only for API keys). The two values differ, and each returned HTTP 200 from the hosted API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Config | `default` publishable key | same | Public by design |
| `NEXT_PUBLIC_SUPABASE_URL` | Config | `tidewater-staging` | same | |
| `STRIPE_SECRET_KEY` | Secret | test key | same | **Reused from local development, staging only** (SECRETS-003) |
| `ANTHROPIC_API_KEY` | Secret | `tidewater-lab` key | same | **Reused from local development, staging only** (SECRETS-003) |
| `SENTRY_DSN` | Secret | same DSN | same | Not a strong secret, but it lets anyone send events, so it's stored as one |
| `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_TEAM`, `ANTHROPIC_MODEL`, `AI_MONTHLY_BRIEF_LIMIT` | Config | | | |
| `STRIPE_WEBHOOK_SECRET`, `APP_URL` | not set yet | | | Both need a deployed URL: the local webhook secret only works with `stripe listen`. Added at Tuesday's deploy |

- **Who has access.**
  - Vercel: the team `geekiodevs-projects` is on the Hobby plan, which has no team roles (https://vercel.com/docs/rbac/access-roles: roles are Pro and Enterprise only). Only the `geekiodev` account can read or change these variables. Secret values are write-only after saving (https://vercel.com/docs/environment-variables/sensitive-environment-variables), so they can't be read back from Vercel at all.
  - Supabase: the scoped token can't read organization membership, so who else can see the keys in the dashboard is for the owner to confirm.
- **Rotation:**
  - Tonight's rotation: once both new keys were in Vercel, the owner deleted the `default` secret key. Confirmed gone at **2026-11-19 10:54:47 UTC** (`supabase-api-keys.txt`). The legacy `anon` and `service_role` keys still exist on the project but are no longer used anywhere.
  - Rotating `vercel_production` itself happens at Tuesday's deploy.

### Local file

- `.env.local` is now owner-only (`-rw-------`). This was SECRETS-002, found and closed today.
- The revoked Sentry token line was removed.
- The Supabase token `tidewater-lab-11b` replaced the old one, which the owner revoked.

### ABUSE-001

- **The change:** `clientIp()` (`src/lib/rate-limit.ts`) reads only `x-vercel-forwarded-for`, and only when `VERCEL=1`. The value must parse as an IP address. `X-Forwarded-For` and `X-Real-IP` are never read. Off Vercel, every request falls into one "unknown" bucket, and the per-email login limit still applies.
- **Why that header** (https://vercel.com/docs/headers/request-headers, last updated 2025-12-13):
  - Vercel overwrites `X-Forwarded-For` and does "not forward external IPs" to prevent spoofing.
  - `x-vercel-forwarded-for` is "identical to the `x-forwarded-for` header", and it isn't overwritten if another proxy is put in front of Vercel.
  - The page doesn't say in so many words that a client-sent `x-vercel-forwarded-for` is replaced. So confirming the header can't be spoofed is a **test for Tuesday's deploy**, not something this lab can show.
- **Test:** `tests/unit/client-ip.test.ts`, 6 tests.
  - A spoofed `X-Forwarded-For` or `X-Real-IP` is ignored, and rotating the spoofed value doesn't create new buckets.
  - The Vercel header isn't trusted off Vercel, non-IP values are rejected, and IPv6 works.
  - With the old `clientIp()`, 5 of the 6 tests fail.
- **Acceptance record** (`audit/acceptances/ABUSE-001.md`) updated: fix merged, and the acceptance closes at first deploy.

## 6. After

| What | Evidence | Result |
| --- | --- | --- |
| Secrets in a platform store, per environment | `vercel-env.txt` | 10 variables, each added separately for Production and Preview. All 4 secrets are Secret type (write-only) |
| Different Supabase secret key per environment | `supabase-api-keys.txt` | `vercel_production` and `vercel_preview`, different values, both valid (HTTP 200) |
| New key types only | `src/lib/env.ts`, `supabase-api-keys.txt` | The app refuses legacy keys. No legacy key is stored in Vercel |
| Rotation recorded | `supabase-api-keys.txt` | `default` secret key deleted Nov 19, confirmed at 10:54:47 UTC |
| Access named | this README | Vercel: the `geekiodev` account only (Hobby). Supabase org membership: owner to confirm |
| Hosted schema | `hosted-migrations.txt`, `hosted-signed-out-probe.txt` | 5 of 5 migrations applied; every table refuses signed-out reads |
| Spoofed `X-Forwarded-For` ignored | `tests/unit/client-ip.test.ts` | Pass; 5 of 6 fail against the old code |
| `.env.local` owner-only | `before.md` | `-rw-r--r--` → `-rw-------` |
| CI | PR checks | Type check, lint, 136 tests, build: green |

## 7. Evidence kept

`evidence/lab-11/`: `before.md`, `vercel-env.txt`, `supabase-api-keys.txt`, `hosted-migrations.txt`, `hosted-signed-out-probe.txt`. Every file was searched for key-shaped strings (`sb_secret_`, `sb_publishable_`, `sk_test_`, `eyJ`) before committing; none found.

## 8. Done when

- [x] Every secret the app uses is listed with where it lives and who can read it (names only).
- [x] Code, `.env.example` and README use publishable and secret keys; legacy keys are refused.
- [x] Migrations applied to the hosted project (by the owner) and verified (by the agent).
- [x] Every secret is a Secret-type Vercel variable, separately for Production and Preview, with no Git integration and no deploy.
- [x] Names, scopes and access recorded.
- [x] One rotation performed and dated (the `default` secret key, Nov 19).
- [x] `clientIp()` reads only Vercel's header, with a spoofing test; acceptance record updated.
- [ ] `x-vercel-forwarded-for` confirmed unspoofable on the deployed app (Tuesday).
- [ ] `vercel_production` rotated (Tuesday).

## Open after this lab

**At Tuesday's deploy (Gate 1)**

- Confirm on the deployed app that client-sent `x-vercel-forwarded-for` and `X-Forwarded-For` don't change the IP the app uses. ABUSE-001's acceptance closes then.
- Rotate `vercel_production`.
- Add `STRIPE_WEBHOOK_SECRET` (from a Stripe endpoint for the deployed URL) and `APP_URL`.
- Push the Auth settings from `supabase/config.toml` to the hosted project (it got the schema only), and set its Site URL.
- Set the Vercel framework preset to Next.js; the project was created as "Other".

**Before the first real customer (Gate 2)**

- **SECRETS-003:** the Stripe test key and the Anthropic `tidewater-lab` key in Vercel are the same values as in local development, for staging only. Replace them with per-environment keys.
- **AGENT-001:** the agent works under the owner's identity (GitHub, Vercel CLI, `.env.local`). Give it its own, with least privilege.

**Housekeeping**

- The legacy `anon` and `service_role` keys still exist on `tidewater-staging`. Disable them in the dashboard once nothing uses them.
- The Supabase personal access token still lives in `.env.local`, next to the app's secrets.
- During setup, before any key was stored, one API read printed the masked display prefix of the old `default` secret key: the first few characters, the same masking the dashboard shows. That key has since been deleted.
