# Risk acceptance: ABUSE-001

| Field | Value |
| --- | --- |
| Finding | ABUSE-001: per-IP rate limits trust the client-supplied `X-Forwarded-For` header |
| Gate | G2.5 (rate limits), which passes; this finding is about how strong the limit is, not whether it exists |
| Severity | Medium |
| Decision | Accept, with conditions |
| Risk owner | @geekiodev |
| Accepted by | @geekiodev |
| Accepted on | Nov 5, 2026 |
| Expires | First deploy, or Dec 31, 2026, whichever comes first |

## The risk

`clientIp()` in `src/lib/rate-limit.ts` takes the first entry of `X-Forwarded-For`, falling back to `X-Real-IP`. Unless a trusted proxy in front of the app overwrites that header, any client can set it, so each request can claim a new IP and every per-IP limit can be sidestepped.

Paths that use the per-IP limit:

| Path | Per-IP limit | Other limit on the same path |
| --- | --- | --- |
| Log in (`loginAction`) | 20 per 15 minutes | 8 per email address per 15 minutes |
| Sign up (`signupAction`) | 5 per hour | None in the app |

## What the compensating control actually covers

The risk register named the per-email login limit as the compensating control. Tested against each path, it covers less than that suggested:

- **Brute force against one account:** covered. The per-email limit holds whatever IP the request claims.
- **Password spraying** (one common password tried across many addresses): not covered. Each address stays under its own limit, and the per-IP limit that should catch the pattern can be sidestepped.
- **Sign-up abuse** (mass account creation): not covered by the app. New accounts must confirm their email before they can do anything, which slows abuse but doesn't stop it. Supabase Auth has its own rate limits; whether they apply per real client IP when Tidewater calls Supabase from the server is not yet tested.

So the real reason this is acceptable today is that there is no exposure: the as-built app runs only locally, with dummy data, and is never deployed. That is a condition, not a compensating control, which is why the acceptance ends when the condition does.

## Conditions

- Tidewater stays undeployed, with test data only.
- Before first deploy, `clientIp()` reads the client IP only from a header the hosting platform sets and clients can't override, and that is tested with a spoofed header. This is now an item in the "Fix before first deploy" list of the risk register.
- Before first deploy, test whether Supabase Auth's own rate limits see the real client IP.

## What ends it

The acceptance ends at whichever comes first:

- the first deploy, when the fix above must be in place;
- Dec 31, 2026, when it must be renewed in writing or the finding fixed.

## Separation of duties

The risk owner and the person accepting the risk are the same person. A reviewer would expect someone other than the owner to accept residual risk; on a one-person project that isn't possible, so the gap is recorded here and in the risk register rather than hidden.

Maps to: ISO 27001:2022 clause 6.1.3 f (risk owners approve the treatment plan and accept residual risk); NIST 800-53 RA-7 and CA-5; SOC 2 CC9.1.
