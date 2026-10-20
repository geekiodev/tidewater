## What changed and why

<!-- One or two sentences. Link the issue if there is one. -->

## How it was tested

- [ ] `npm run typecheck`, `npm run lint` and `npm test` pass locally
- [ ] Tried it in the browser (describe what you clicked)

## Security checklist

Tick what applies, or write "n/a" next to the heading.

- [ ] **Data access:** new tables have RLS enabled, explicit grants, and isolation tests in `tests/db/`
- [ ] **Auth:** new pages, actions and API routes check the session on the server (`requireUser` / `requireWorkspace`), and never trust a workspace id, user id or role from the browser
- [ ] **Input:** all new input is validated with a zod schema, with length and page-size caps
- [ ] **Personal data:** nothing personal (names, emails, phones, note text) goes into logs or error reports, and any new data sent to a third party is listed in the README
- [ ] **Secrets:** no keys, tokens or real credentials in code, config, docs or test fixtures; new env vars are added to `.env.example` with dummy values
- [ ] **Billing:** prices and plans still come only from the server; webhook changes keep signature checks and idempotency
- [ ] **AI:** customer data sent to the model is minimal and kept separate from instructions; model output is only displayed as text
- [ ] **Migrations:** the new migration applies cleanly on a fresh database (`npm run test:db`)

## Anything reviewers should look at closely?
