# Tidewater

A lightweight CRM for small agencies. Each agency gets a workspace for its clients, contacts and notes.

Stack: Next.js (App Router, TypeScript), Supabase (Postgres + Auth, run locally with the Supabase CLI), Stripe Checkout (test mode), Anthropic API.

This README is completed in later steps of the build.

## Quick start (fresh clone)

Requirements: Node 22+, npm, Docker (for the local Supabase stack).

```bash
npm ci
npx supabase start            # starts local Postgres, Auth, Studio, Mailpit
cp .env.example .env.local    # then paste the local keys printed by `npx supabase status`
npm run dev                   # http://localhost:3000
```

No real secrets live in this repo. All configuration comes from environment variables; `.env.example` lists the names with dummy values.
