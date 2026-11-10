# Lab 9 before: errors reach stderr only

Nov 10, 2026, branch `lab-09-error-tracking` at `e112c05` (main), `next dev` on port 3123, local Supabase.

A temporary route (`src/app/auth/callback/lab-09-boom/route.ts`, never committed) threw:

    Error: Lab 9 unhandled test for test@example.com, phone 555-010-4477, note: Renewal call went badly

`GET /auth/callback/lab-09-boom` returned 500. The app's reporter (`onRequestError` → `reportError`) printed one JSON line on stderr: `before-stderr-line.json`. Email and phone were replaced with `[email]` and `[phone]`; the free-text note ("Renewal call went badly") was not, because the scrubber is pattern-based and a sentence is not a pattern. Nothing was sent anywhere else: there is no error tracker, so nobody is told.

Next.js's own dev-server logging printed the raw message twice in the same terminal (the `⨯ Error: ...` line and the code frame), outside the reporter. Those lines are not saved here.
