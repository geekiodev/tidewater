# Lab 10: signed-in smoke test on the live app

Nov 24, 2026, https://tidewater-bice.vercel.app (production, deployment `dpl_4v8CQqRj4cyNdRAqvoP3qMx5ux1p`, main `177aead`). Test data only. The owner drove the browser; the agent read the Vercel runtime logs and the Supabase Auth log the owner shared. Supabase dashboard times are UTC-5.

| Time (UTC) | Step | Result | Source |
| --- | --- | --- | --- |
| 14:29:18, 14:38:48 | Sign-up through the app with `lab10-signup@example.com` | Refused by Supabase Auth: `400 Email address "…" is invalid` (`/signup`). The app showed its generic "We couldn't create your account" and reported the error through the scrubber, with the address `[redacted]` in the log line | Vercel runtime log; Supabase Auth log |
| 14:46:36 | Test user created by the owner in the Supabase dashboard ("Add user", auto-confirmed) | Accepted (`/admin/users`, 200). Admin-created users skip the email check that public sign-up applies | Supabase Auth log |
| 14:47:21, 14:48:54 | Log in | `400 Invalid login credentials`: the password typed didn't match. The app's two rate-limit calls (per IP, per email) returned 200 before each attempt, so the deployed app, its secret key and the limiter all worked | Supabase API gateway and Auth logs |
| ~14:55 | Log in again (user re-created), onboarding | Signed in, sent to onboarding (no workspace yet), created the workspace "Lab 10 Test Agency" | Owner, screenshot |
| ~14:57 | Add a client before subscribing | Refused with the subscription message. Expected: inserts need an active subscription (app check and RLS policy) | Owner, screenshot |
| 15:00:26–27 | Stripe test-mode Checkout (Starter), test card | Two webhook deliveries to `/api/stripe/webhook`, no error logged; the workspace became active | Vercel runtime log; owner |
| 15:00:31 onwards | `/clients`, `/settings/billing`; one client and one note added | Worked | Vercel runtime log; owner |

## What this shows

- **Works on the deployment:** sign-in, the session cookie on the Vercel domain, onboarding's `create_workspace()`, the subscription gate, Stripe Checkout, and the live webhook with `STRIPE_WEBHOOK_SECRET`.
- **Not shown:** the sign-up form end to end. Supabase's built-in email sends only to the org's members, and public sign-up rejects `example.com` addresses outright. A custom email provider is on Gate 2.
- **Usability finding (Low):** for `email_address_invalid` the sign-up form says "Please try again", which can never work. It should be a field error on the email.
- **Log retention:** Vercel Hobby keeps runtime logs for about an hour. A request older than that can't be looked up afterwards.
