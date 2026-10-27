# Tidewater CRM: build prompt pack

Tidewater is a lightweight CRM for small agencies. Each agency (a "workspace") keeps its clients' contacts and notes in one place, pays a monthly subscription, and can ask an AI assistant for a quick brief on any client account.

These are the prompts, in order, exactly as given to the AI coding agent. The requirements in each prompt come from the obligations scoped before the build: the app holds customers' personal data, takes card payments, has an LLM feature that reads customer data, and will be sold to mid-size companies that send security questionnaires.

---

## Prompt 0: Context (given once, before the others)

You're building the first version of Tidewater, a lightweight CRM for small agencies. It will be sold to mid-size companies, so it has to hold up to their security questionnaires from day one.

Stack:
- Next.js (App Router, TypeScript)
- Supabase for Postgres and auth, run locally with the Supabase CLI for now
- Stripe Checkout (hosted) for subscriptions, test mode only
- The Anthropic API for the AI feature

Ground rules for the whole build:
- Never put real secrets anywhere: not in code, not in the repo, not in config files you or any coding agent reads (README, CLAUDE.md, AGENTS.md and similar). Everything comes from environment variables, with a `.env.example` that lists names and dummy values only.
- Don't deploy anything. This runs locally.
- The README must let a new developer go from a fresh clone to a running app with the steps written there.

Work through the prompts in order. After each one, make sure the project still builds.

---

## Prompt 1: Workspaces, accounts and access

Set up sign-up and login with Supabase Auth. A user creates a workspace (their agency) at sign-up and can invite teammates by email. A workspace has two roles: owner and member.

Requirements:
- Every page and API route except the landing page, login and sign-up requires a logged-in user, and that check happens on the server, not only in the UI.
- Each workspace's data is visible only to its own members. Enforce this in the database with row-level security on every table, so a mistake in application code still can't leak one agency's data to another.
- Roles and workspace membership are always looked up on the server. Never trust a role, workspace ID or user ID sent from the browser.
- Rate-limit login and sign-up attempts.

---

## Prompt 2: Contacts and notes

Each workspace keeps clients (companies) and contacts (people at those companies: name, email, phone, job title), plus free-text notes on any client.

Requirements:
- Full create, read, update and delete for clients, contacts and notes, scoped to the user's workspace.
- Validate every input on the server with a schema, and cap sizes: field lengths, note length, and page sizes on list endpoints.
- When something goes wrong, report the error somewhere a developer can see it, but strip personal data (names, emails, phone numbers, note text) from what gets reported.
- No placeholder screens or sample data in what users see.

---

## Prompt 3: Billing

Workspaces subscribe to a monthly plan through Stripe Checkout (hosted, so card details never touch our servers). There are two plans: Starter and Team.

Requirements:
- The price for each plan is set on the server. Never accept a price, plan amount or discount from the browser.
- A Stripe webhook updates the workspace's subscription status. Verify the webhook signature on every event, and make the handler safe to receive the same event twice.
- Workspaces without an active subscription can view their data but can't create new records or use the AI assistant.
- Add sensible security headers (including a content security policy and HSTS) and protect forms against cross-site request forgery.

---

## Prompt 4: Account brief (AI assistant)

On any client page, a user can click "Brief me". The app sends that client's contacts and recent notes to the Anthropic API and shows back a short summary of the relationship and a suggested follow-up email, which the user can copy.

Requirements:
- Call the model only from the server. The API key never reaches the browser.
- Send only the fields the brief needs.
- Notes are typed by customers' staff and may contain anything, including text that tries to instruct the model. Treat them as untrusted data, keep them separate from your instructions, and make sure the model's output is only ever displayed as text. The model can't trigger any action in the app.
- Each workspace has a monthly cap on AI usage. Set a timeout and a maximum response length on every call, and rate-limit the endpoint.

---

## Prompt 5: Tests, CI and handover

Requirements:
- Tests for the paths that matter most: login and access control, workspace isolation (one workspace can't read or change another's data), and billing (webhook signature checks and duplicate events). Run the isolation and billing tests against a real database, not mocks.
- A GitHub Actions workflow that runs type checks, lint and tests on every pull request. Don't switch off type or lint errors to make the build pass.
- Automated dependency update configuration.
- A pull request template, and a CODEOWNERS file so changes need a human reviewer.
- A health check endpoint.
- Finish the README: setup from a fresh clone, environment variables, running tests, and what's not built yet.
