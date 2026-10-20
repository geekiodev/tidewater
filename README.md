# Tidewater

A lightweight CRM for small agencies. Each agency gets a **workspace** with its clients (companies), their contacts (people) and free-text notes. Workspaces pay a monthly subscription, and anyone in the workspace can ask an AI assistant for a quick brief on a client account.

**Stack:** Next.js 16 (App Router, TypeScript) · Supabase (Postgres + Auth, run locally with the Supabase CLI) · Stripe Checkout (test mode only) · Anthropic API.

> Status: first version, **not deployed and not production-ready**. See [What's not built yet](#whats-not-built-yet) and `BUILD_LOG.md`.

---

## Run it from a fresh clone

### 1. Prerequisites

- Node.js 22+ and npm
- Docker, which the Supabase CLI uses to run the local stack
- Optional, for billing: the [Stripe CLI](https://docs.stripe.com/stripe-cli) and a Stripe account in **test mode**
- Optional, for the AI brief: an Anthropic API key

### 2. Install

```bash
git clone <repo-url> tidewater
cd tidewater
npm ci
```

### 3. Start Supabase locally

```bash
npx supabase start
```

This starts Postgres, Auth, Studio (http://127.0.0.1:54323) and Mailpit (http://127.0.0.1:54324, where sign-up confirmation emails land). It also applies every migration in `supabase/migrations/`. To reset the database later, run `npx supabase db reset`.

Run `npx supabase status` to print the local API URL, anon key and service-role key.

### 4. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local` (it's git-ignored; never commit it):

| Variable | Where it comes from | Used for |
|---|---|---|
| `APP_URL` | `http://localhost:3000` locally | Redirect URLs, CSRF origin check |
| `NEXT_PUBLIC_SUPABASE_URL` | `npx supabase status` → API URL | Supabase client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `npx supabase status` → anon key | Supabase client (public by design; RLS protects data) |
| `SUPABASE_SERVICE_ROLE_KEY` | `npx supabase status` → service_role key | **Server only**: rate limiting, Stripe webhook, AI quota, health check |
| `STRIPE_SECRET_KEY` | Stripe Dashboard (test mode) → Developers → API keys. Must start with `sk_test_` | Creating Checkout / Portal sessions |
| `STRIPE_WEBHOOK_SECRET` | Printed by `stripe listen` (see below), starts with `whsec_` | Verifying webhook signatures |
| `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_TEAM` | Price ids (`price_...`) of two monthly recurring prices you create in Stripe test mode | The only source of plan prices |
| `ANTHROPIC_API_KEY` | Anthropic Console | Account brief (server only) |
| `ANTHROPIC_MODEL` | Optional, default `claude-haiku-5-5` | Model for the brief |
| `AI_MONTHLY_BRIEF_LIMIT` | Optional, default `200` | Briefs per workspace per calendar month |
| `TEST_DATABASE_URL` | Only for tests; see [Running tests](#running-tests) | Throwaway Postgres DB for the test suite |

The app starts without Stripe or Anthropic keys. Billing and the AI brief show an error until those keys are set.

### 5. Run the app

```bash
npm run dev
```

Open http://localhost:3000, click **Create a workspace**, then confirm your email through the link in Mailpit (http://127.0.0.1:54324).

### 6. Billing locally (optional)

1. In Stripe **test mode**, create two products with monthly recurring prices. Put their price ids in `STRIPE_PRICE_STARTER` and `STRIPE_PRICE_TEAM`.
2. Forward webhooks to your machine and copy the printed `whsec_...` into `STRIPE_WEBHOOK_SECRET`:
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook \
     --events checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted
   ```
3. Restart `npm run dev`. Open **Billing**, subscribe with test card `4242 4242 4242 4242`, and the workspace becomes active once the webhook arrives.

A new workspace has **no subscription**. Until it subscribes it can sign in and see its data, but it can't create clients, contacts or notes, or use the account brief.

---

## Running tests

```bash
npm run typecheck   # next typegen + tsc
npm run lint        # eslint, zero warnings allowed
npm test            # all tests: unit + database
npm run test:unit   # unit tests only (no database needed)
npm run test:db     # database tests only
```

The **database tests** (workspace isolation, access control, invitations, rate limiting, billing webhook and subscription gating) run against a **real Postgres**, not mocks. Set `TEST_DATABASE_URL` to a database whose name ends in `_test`. The suite **drops and recreates** that database, then applies a small Supabase shim (`tests/db/supabase-shim.sql`: the `auth` schema, `auth.uid()` and the `anon`/`authenticated`/`service_role` roles) followed by every migration in `supabase/migrations/`.

Use a plain Postgres (15+) where the connecting user is a superuser, for example:

```bash
docker run -d --name tw-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/tidewater_test npm test
```

Pointing the tests at the Supabase stack's own Postgres (port 54322) hasn't been tried. Its `postgres` user isn't a full superuser, so the shim and role switching may not work there; prefer a separate plain Postgres.

Webhook tests sign payloads with Stripe's own test helper (`stripe.webhooks.generateTestHeaderString`) and a random secret. No Stripe account or network access is needed.

CI (`.github/workflows/ci.yml`) runs type check, lint, all tests (with a Postgres 16 service container) and a production build on every pull request. Dependabot (`.github/dependabot.yml`) opens weekly update PRs for npm packages and GitHub Actions.

---

## How it's put together

```
src/
  proxy.ts                 Runs on every request: CSRF origin check, CSP nonce + security headers,
                           Supabase session refresh, signed-out requests → /login or 401
  instrumentation.ts       Uncaught server errors → scrubbed error reporter
  app/
    login/, signup/, auth/ Supabase Auth (email + password, email confirmation)
    onboarding/            Signed-in user without a workspace
    invite/[token]/        Accept an invitation
    (app)/clients/         Clients, contacts, notes (server actions) + "Brief me" panel
    (app)/settings/team/   Members and invitations (owner manages)
    (app)/settings/billing Stripe Checkout + Billing Portal (owner)
    api/clients/[id]/brief AI account brief (POST)
    api/stripe/webhook     Stripe webhook (signature-verified, idempotent)
    api/health             Health check (GET, public)
  lib/
    auth.ts                requireUser / requireWorkspace / requireOwner: session + workspace + role from the DB
    validation/            zod schemas with size caps
    billing/               Plans (server-side prices), webhook handling
    ai/                    Brief prompt building, model call
    security/              CSP/headers, CSRF check
    errors/report.ts       Error reporter that strips personal data
supabase/migrations/       Schema, RLS policies, grants, DB functions
tests/unit/                Proxy access control, login rate limiting, CSRF, CSP, validation, scrubbing, AI prompt
tests/db/                  Real-Postgres tests: isolation, roles, invitations, rate limits, billing
```

**Security model in one paragraph.** Postgres row-level security is the backstop. Every table has RLS on, and Supabase's default grants are revoked and replaced with the minimum each role needs. Workspace membership is checked in the database from `auth.uid()`. Contacts and notes use composite foreign keys, so they can't point at another workspace's client. Billing columns can only be written by the Stripe webhook (service role). On top of that, every page, server action and API route checks the session on the server and reads the workspace and role from the database; nothing is taken from the browser. The service-role key is used only for rate limiting, the Stripe webhook, the AI quota and the health check, never to serve a user's data.

**Data sent to third parties.** Stripe gets the owner's email (Checkout) and the workspace id in metadata; card details go straight to Stripe's hosted page. Anthropic gets the client's name, contacts' names and job titles, and up to 15 recent notes when a user clicks "Brief me". Contact emails and phone numbers are not sent.

---

## What's not built yet

Product
- **Invitation emails aren't sent.** The owner gets a one-time link to send the invitee themselves. Accepting it requires signing in with the invited, confirmed email address.
- One workspace per user. There's no role changes, ownership transfer, leaving a workspace, or deleting a workspace or account.
- No free trial: a new workspace must subscribe before it can add records. `past_due` counts as inactive.
- No plan differences beyond price (no seat limits or feature flags).
- No AI usage display, no saved briefs.
- No JSON REST API, import/export, contact search, audit log, or file attachments.

Security and compliance work still needed before real customer data
- **Never run against real Supabase, Stripe or Anthropic.** The first build environment had no Docker images or credentials. Run the full flow end to end on a real local stack first; see `BUILD_LOG.md`.
- No hosted error tracker. Errors go to stderr as scrubbed JSON, and the scrubbing is pattern-based, so it can miss personal data.
- No MFA, SSO, session management UI, or account lockout beyond rate limits.
- No audit logging of who viewed or changed what.
- No data retention or deletion tooling (GDPR/CCPA requests), backups policy, or DPA/subprocessor documentation.
- The IP used for rate limiting comes from `X-Forwarded-For`. Deploy behind a proxy that sets it, or rely on the per-email limits.
- CODEOWNERS uses a **placeholder owner** (`@tidewater-maintainers-placeholder`). Replace it, then turn on branch protection with "Require review from Code Owners" on GitHub.
- `src/lib/database.types.ts` is hand-written. Regenerate it with `npx supabase gen types typescript --local`.
- Deployment (hosting, secrets management, production Supabase project, Stripe live mode) is deliberately out of scope.
