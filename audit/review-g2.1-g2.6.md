# Review: G2.1 and G2.6, route by route

The baseline left G2.1 and G2.6 pending until every write path had been reviewed by hand (phase 2). This is that review. Done Nov 11, 2026 on `main` at `635b5ed`: code reading, plus checks against the local database with the Lab 5 dummy data, all inside transactions that were rolled back. Evidence is in [`evidence/review-g2.1-g2.6/`](evidence/review-g2.1-g2.6/).

**The criteria**

- **G2.1:** authorization is checked on the server, with workspace and role read from the database and never trusted from the browser. Billing columns are not writable by users.
- **G2.6:** every write path is validated with a zod schema with size caps. List endpoints cap page size.

**Update, Nov 11 (later): both findings are fixed and both gates pass.** See "Fixed" at the end. The rest of this document is the review as first written.

**Result at review time: G2.1 fails (AUTHZ-001, Medium) and G2.6 fails (VALID-001, Low).** Every server action and route handler meets both criteria except one action, `deleteClientAction`, on G2.1. The other failure is a write path outside the app's own code: the Supabase Data API, which any signed-in user can call directly with their own session token.

## How the app is put together (what was checked)

- **Who the caller is:** `requireUser()` asks Supabase Auth to verify the session (`getUser()`, not just the cookie contents). `requireWorkspace()` and `requireOwner()` then read the workspace and role from `workspace_members` for that user ID (`src/lib/auth.ts`). No action or route accepts a workspace ID or role from the browser. Record IDs from forms only pick a row; every query is also filtered by the workspace ID from the server.
- **The database repeats every check:** RLS is on for every table, the default grants are revoked, and each role gets back only what it needs (`db-access.txt`). The signed-in role can update only `workspaces.name`. The billing functions (`apply_stripe_event`, `reserve_ai_brief`, `settle_ai_brief`, `rate_limit_hit`) can't be executed by the anon or signed-in roles.
- **Size limits before any validation runs:** Next.js limits server-action request bodies to 1 MB by default (no override in `next.config.ts`). The proxy, which runs on every route, buffers at most 10 MB of any request body.
- **Validation schemas:** `src/lib/validation/auth.ts` and `src/lib/validation/crm.ts`. Every text field has a maximum length, and the database's check constraints repeat those maximums.

## Server actions

| # | File | Action | G2.1: check found | G2.1 | G2.6: check found | G2.6 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `src/app/auth/actions.ts` | `loginAction` | Before sign-in, so nothing to authorize. Per-IP and per-email rate limits. Redirect target goes through `safeNextPath` (same-site only) | Pass | `loginSchema`: email ≤254, password ≤128, `next` ≤512 | Pass |
| 2 | `src/app/auth/actions.ts` | `signupAction` | Before sign-in. The workspace is created by a database trigger from the sign-up details, with the creator as owner. Invite-mode sign-up grants no membership | Pass | `signupSchema` (discriminated union): email ≤254, password 12 to 128, workspace name 1 to 100, invite token exactly 43 URL-safe characters. The trigger checks the name length again | Pass |
| 3 | `src/app/auth/actions.ts` | `logoutAction` | Signs out the caller's own session | Pass | No input | Pass |
| 4 | `src/app/(app)/clients/actions.ts` | `createClientAction` | `requireWorkspace()`. `workspace_id` and `created_by` come from the server. RLS insert policy: member of the workspace, active subscription, `created_by = auth.uid()` | Pass | `clientInputSchema`: name 1 to 200, website ≤300 and http(s) only | Pass |
| 5 | same | `updateClientAction` | `requireWorkspace()`. Filtered by `id` and the server's workspace ID. RLS: member. Only `name` and `website` can be updated (column grants) | Pass | `idSchema` (UUID) and `clientInputSchema` | Pass |
| 6 | same | `deleteClientAction` | `requireWorkspace()`, filtered by the server's workspace ID. RLS: any member. **But deleting a client cascades to its notes and contacts, so a member can delete notes they could not delete directly (author or owner only).** | **Fail: AUTHZ-001** | `idSchema` | Pass |
| 7 | same | `createContactAction` | `requireWorkspace()`. RLS insert: member and active. The foreign key on (`client_id`, `workspace_id`) stops a contact pointing at another workspace's client | Pass | `idSchema` and `contactInputSchema`: name ≤200, email ≤254 and valid, phone ≤50 and limited characters, job title ≤200 | Pass |
| 8 | same | `updateContactAction` | `requireWorkspace()`, filtered by workspace. RLS: member. Column grants: name, email, phone and job title only | Pass | `idSchema` and `contactInputSchema` | Pass |
| 9 | same | `deleteContactAction` | `requireWorkspace()`, filtered by workspace. RLS: member | Pass | `idSchema` | Pass |
| 10 | same | `createNoteAction` | `requireWorkspace()`. RLS insert: member, active, `author_id = auth.uid()`. The composite foreign key keeps the note in the same workspace | Pass | `idSchema` and `noteInputSchema`: body 1 to 10,000 | Pass |
| 11 | same | `updateNoteAction` | `requireWorkspace()`, filtered by workspace. RLS: author only. Only `body` can be updated | Pass | `idSchema` and `noteInputSchema` | Pass |
| 12 | same | `deleteNoteAction` | `requireWorkspace()`, filtered by workspace. RLS: author or workspace owner | Pass | `idSchema` | Pass |
| 13 | `src/app/(app)/settings/team/actions.ts` | `inviteMemberAction` | `requireOwner()` (role read from the database). `workspace_id` and `invited_by` come from the server. RLS insert: owner, `invited_by = auth.uid()`, not already accepted | Pass | `inviteSchema` (email ≤254). The token is generated on the server and only its hash is stored | Pass |
| 14 | same | `revokeInvitationAction` | `requireOwner()`, filtered by workspace. RLS: owner | Pass | `uuidSchema` | Pass |
| 15 | same | `removeMemberAction` | `requireOwner()`, filtered by workspace, can't remove yourself. RLS: owner, not self | Pass | `uuidSchema` | Pass |
| 16 | `src/app/(app)/settings/billing/actions.ts` | `startCheckoutAction` | `requireOwner()`. The Stripe customer ID is read from the database, never from the form. Workspace ID goes in Checkout metadata from the server. Billing state itself is written only by the webhook | Pass | `checkoutSchema`: `plan` must be one of the plan keys | Pass |
| 17 | same | `openBillingPortalAction` | `requireOwner()`. Customer ID from the database | Pass | No input | Pass |
| 18 | `src/app/invite/[token]/actions.ts` | `acceptInvitationAction` | `requireUser()`. `accept_invitation()` (security definer) takes the user from `auth.uid()`, requires a confirmed email that matches the invitation, an open and unexpired invitation, and no existing workspace. The role is always `member` | Pass | `inviteTokenSchema` (43 characters). The function checks the length again | Pass |
| 19 | `src/app/onboarding/actions.ts` | `createWorkspaceAction` | `requireUser()`. `create_workspace()` makes `auth.uid()` the owner and refuses if the user already has a workspace | Pass | `workspaceNameSchema` (1 to 100). The function checks the length again | Pass |

## Route handlers

| # | File | Route | G2.1: check found | G2.1 | G2.6: check found | G2.6 |
| --- | --- | --- | --- | --- | --- | --- |
| 20 | `src/app/auth/callback/route.ts` | `GET /auth/callback` | Exchanges a one-time PKCE code from Supabase Auth for a session. No app data is written. Redirect target goes through `safeNextPath` | Pass | `code` ≤512 characters; `next` ≤512 and same-site only | Pass |
| 21 | `src/app/api/health/route.ts` | `GET /api/health` | Public by design. The service-role read is `select id … limit 1`, and only ok or error is returned | Pass | No input, no write | Pass |
| 22 | `src/app/api/stripe/webhook/route.ts` | `POST /api/stripe/webhook` | Public, authenticated by the Stripe signature, which is verified before anything is parsed. It is the only writer of the billing columns, through `apply_stripe_event()` with the service role (`src/lib/billing/webhook.ts`) | Pass | No zod schema: the payload comes from Stripe, not from a user, and is only read after the signature checks out. Every stored field is still narrowed: workspace ID must match a UUID pattern, plan comes from the configured price map, and the event ID and status are checked by database constraints. Size: a declared `content-length` over 512 KB is refused before reading, and the actual size is checked after reading. A body with no declared length is buffered by the proxy up to 10 MB first (see observations) | Pass |
| 23 | `src/app/api/clients/[id]/brief/route.ts` | `POST /api/clients/:id/brief` | Session, workspace and active subscription all come from the server. The client is read through the user's own database connection (RLS applies) and filtered by workspace. Contacts and notes are filtered by workspace. Usage is reserved and settled with the service role, for the server's workspace ID only | Pass | `idSchema` on the path parameter. No request body. Prompt input is capped by `BRIEF_LIMITS` (contacts and notes per brief). Writes are only the usage counters, through database functions | Pass |

## Writes that go around the app

| # | Path | G2.1: check found | G2.1 | G2.6: check found | G2.6 |
| --- | --- | --- | --- | --- | --- |
| 24 | Supabase Data API (PostgREST) with a user's own session token: `insert`, `update` and `delete` on `clients`, `contacts`, `notes`, `workspace_invitations` and `workspace_members` | RLS, column grants and function privileges apply the same rules as above. Billing: updating `subscription_status` and `plan`, and calling `apply_stripe_event` and `reserve_ai_brief`, are all refused (`probe-data-api-writes.txt`) | Pass (except AUTHZ-001, which applies here too) | Size caps hold: the database check constraints refuse a 301-character website and a 201-character name. **Format rules don't: a `javascript:` website, an email of "not an email", a phone of "call me maybe!!" and an `ftp://` website were all accepted.** Zod runs only in the server actions | **Fail: VALID-001** |

## List endpoints (page size)

| Where | Cap |
| --- | --- |
| `/clients` (`src/app/(app)/clients/page.tsx`) | `listQuerySchema`: page size 1 to 50 (default 25), page ≤1000, search ≤100 characters, LIKE wildcards escaped |
| `/clients/[id]` contacts and notes | 50 contacts and 25 notes per page, page ≤1000 |
| `/settings/team` invitations | `limit(50)` |
| `/settings/team` members (`list_workspace_members()`) | No cap of its own. Bounded by PostgREST's `max_rows = 1000` and by members only joining through owner invitations (see observations) |
| AI brief inputs | `BRIEF_LIMITS`: 20 contacts, 15 notes, 1,500 characters per note, 12,000 in total |
| Supabase Data API directly | `max_rows = 1000` (`supabase/config.toml`) |

Pass.

## Findings

### AUTHZ-001: a member can delete other people's notes by deleting the client (G2.1, Medium)

- **Location:** `src/app/(app)/clients/actions.ts:77` (`deleteClientAction`) and the `clients_delete` policy in `supabase/migrations/20261019000200_clients_contacts_notes.sql` (any workspace member may delete a client). The `notes` and `contacts` foreign keys are `on delete cascade`.
- **The rule it gets around:** only a note's author or the workspace owner may delete a note (`notes_delete` policy). A cascade runs without checking the child table's RLS.
- **Failure scenario:** a member who is leaving, or whose account has been taken over, deletes a client. Every note on that client, by every author, and all its contacts, are gone at once. There's no undo and no record of who did it. In the probe, the member's direct delete of the owner's notes matched 0 rows. Deleting the client removed all 4 notes and 3 contacts (`probe-client-delete-cascade.txt`).
- **Fix:** restrict client deletion to the owner (RLS policy, plus `requireOwner()` in the action), or to members only when the client has no notes by anyone else. Add a database test for the cascade. The Lab 5 restore is currently the only way back.
- **Effort:** 1 hour.

### VALID-001: the Data API accepts what the zod schemas reject (G2.6, Low)

- **Location:** `src/lib/validation/crm.ts` (format rules exist only here). The check constraints in `supabase/migrations/20261019000200_clients_contacts_notes.sql` enforce lengths only. The signed-in role's insert and update grants on `clients` and `contacts` (`db-access.txt`).
- **Failure scenario:** a signed-in member sends `PATCH /rest/v1/clients?id=eq.…` with their own token and a website of `javascript:…`. The client page renders it as a link (`src/app/(app)/clients/[id]/page.tsx:82`). Today two things stop it running: React 19.3 replaces `javascript:` URLs when it renders, and the nonce-based CSP blocks inline script. The stored value is still wrong, and a future change (for example, the website shown in an email or a CSV export) would hand it on. Malformed emails and phone numbers get the same treatment.
- **Fix:** move the format rules into the database as check constraints, the same way the length caps are mirrored: website `^https?://`, email shape, phone characters, names not blank once trimmed. Or remove the signed-in role's direct insert and update grants, so that writes go only through the server actions. Test both through the Data API.
- **Effort:** 1 to 2 hours.

## Observations (not findings)

- **Invitation expiry can be set by the owner.** The signed-in role may insert `expires_at` on `workspace_invitations`, so an owner calling the Data API directly could create an invitation that never expires. This only affects the owner's own workspace, and the invitation still needs the invited, confirmed email to be accepted. Fold it into the VALID-001 fix by dropping the column grant.
- **The member list has no cap of its own** (`list_workspace_members()`). PostgREST's 1,000-row limit applies, and members can only join through owner invitations. Add a limit if workspaces ever get large.
- **The webhook's size check on bodies with no declared length** runs after Next.js has buffered the body, which the proxy limits to 10 MB (`experimental.proxyClientMaxBodySize`, default). That's a bound, but 20 times the 512 KB the code means. Setting `proxyClientMaxBodySize` to `1mb` would bring it into line, and the platform's own limit applies once deployed.
- **Server actions rely on Next.js's default 1 MB body limit**, which is fine. Nothing raises it.

## Where this leaves the gates

- **G2.1: fail** (AUTHZ-001). Every route checks the session, workspace and role on the server from the database, and billing can't be written by users. The cascade lets a member destroy data the app's own rules reserve for authors and the owner.
- **G2.6: fail** (VALID-001). Every server action and route validates with zod and caps sizes, and list endpoints cap page size. The Data API path keeps the size caps but not the format rules.

Both block L2, and both are small fixes. They're in the risk register with a proposed due date of Nov 12. Until they're fixed, the app stays at L1.

Maps to: NIST 800-53 AC-3 (access enforcement), AC-6 (least privilege), SI-10 (information input validation); OWASP ASVS V4 (access control) and V5 (validation); SOC 2 CC6.1; ISO 27001:2022 A.8.3, A.8.28.

## Fixed (Nov 11, later the same day)

Both fixes are in one pull request: migration `supabase/migrations/20261111000100_owner_client_delete_and_format_checks.sql`, plus a change to `deleteClientAction`.

- **AUTHZ-001:** the `clients_delete` policy (any member) is replaced by `clients_delete_owner`, which allows the owner only. `deleteClientAction` now calls `requireOwner()`, and the client page shows the delete button to the owner only.
- **VALID-001:** three new check constraints, `clients_website_format`, `contacts_email_format` and `contacts_phone_format`, use the same patterns as the zod schemas (zod 4.6's default email pattern). Every existing row was checked against them before they were added and all passed (`after-existing-rows.txt`). Postgres also validated every row when the constraints were added.

**Tests** (`tests/db/review-fixes.test.ts`, run as the signed-in role, the way the Data API runs a request):

- A member's client delete removes 0 rows, and the client's notes and contacts stay. The owner's delete still works.
- The four probe values (a `javascript:` website, an `ftp://` website, "not an email", "call me maybe!!") are refused with a check violation (23514).
- The database and zod agree on 28 sample values (9 websites, 12 emails, 7 phone numbers).
- With the migration removed, 4 of the 5 new tests fail. The fifth, the owner's delete, passes either way.

**After evidence:** `after-probe-data-api-writes.txt` (every probe value refused, size caps and billing still refused) and `after-probe-client-delete-cascade.txt` (the member's client delete removes 0 rows; all 4 notes and 3 contacts are still there).

**G2.1: pass. G2.6: pass.**
