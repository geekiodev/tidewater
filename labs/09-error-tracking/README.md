# Lab 9: errors that reach a person

Closes OBS-001 and, for errors, OBS-002 from `audit/findings.json`. Run Nov 10, 2026. Evidence is in [`evidence/lab-09/`](../../evidence/lab-09/).

## 1. The gates and why they matter

- **G2.4, an error tracker someone watches (L2).** Errors written to stderr are only seen by whoever happens to be reading the terminal.
- **G3.3, an alert reaches a named person (L3).** A tracker nobody is told about is a log with a nicer screen.

The constraint for this app: error reports may only leave the server after the existing scrubber has removed personal data. Sentry becomes a subprocessor, so what it receives has to be written down.

Maps to: NIST 800-53 SI-4 (system monitoring), AU-6 (audit record review), IR-4 (incident handling), SA-9 (external system services); SOC 2 CC7.2, CC7.3; ISO 27001:2022 A.8.16, A.5.19.

## 2. Starting point

`main` at `e112c05`. The `v0-as-built` tag is not touched by this lab.

## 3. The checks

```bash
# Trigger a server error locally and read what is reported (temporary routes, never committed)
curl http://localhost:3123/auth/callback/lab-09-report   # reportError() with personal data in message and context
curl http://localhost:3123/auth/callback/lab-09-boom     # unhandled throw in a route

# Read back what Sentry stored
curl -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  https://us.sentry.io/api/0/projects/the-geekio-project/javascript-nextjs/events/<event-id>/
```

## 4. Before

`before.md`, `before-stderr-line.json`: an unhandled error containing `test@example.com`, `555-010-4477` and a note returned 500 and produced one scrubbed JSON line on stderr. Email and phone became `[email]` and `[phone]`. Nothing was sent anywhere, so nobody was told.

## 5. The fix

On branch `lab-09-error-tracking`:

- `@sentry/nextjs` 11.11.0 (pinned). Production `npm audit`: 0 vulnerabilities.
- `src/lib/errors/sentry-sink.ts` connects Sentry to the existing reporter with `setErrorSink()`, so Sentry only ever receives the event `reportError()` has already scrubbed. Everything that could capture data on its own is off:
  - `dataCollection`: user info, cookies, headers, bodies, query strings, database query data, stack-frame variables and code context all off. (SDK v11 replaced `sendDefaultPii` with this option, and its defaults collect all of them.)
  - `defaultIntegrations: false`, so no automatic error capture, request data or HTTP instrumentation; `enableRuntimeChannelInjection: false`, which the SDK documents as also capturing errors.
  - No breadcrumbs, no tracing (no sample rate; transactions dropped), no client reports, no server name (the default is the machine's hostname).
  - No browser SDK at all, so no session replay and no browser errors.
  - `beforeSend` drops any event that doesn't carry a random per-process mark that only the sink adds, then removes the mark.
- `src/instrumentation.ts` starts the sink in `register()` on the Node.js runtime only, and only when `SENTRY_DSN` is set. The DSN lives in `.env.local`; `.env.example` has a dummy value.
- **A fix the lab needed:** `report.ts` kept the sink in module state, and its own comment said to "call setErrorSink() once at startup". That never worked: Next.js bundles `instrumentation.ts` separately from routes, so each bundle had its own copy and routes kept writing to stderr only. The sink now lives on `globalThis`.
- `tests/unit/sentry-sink.test.ts`: the Sentry event built from a scrubbed report holds no email, phone or note from the context, and unmarked events are dropped.
- Alert rule "Lab 9: email on every new issue" (Sentry workflow 6319295): a new issue emails the issue owners, falling through to active members (the owner only). `sentry-alert-rule.json`.

## 6. After

| What | Evidence | Result |
| --- | --- | --- |
| Handled error with personal data | `sentry-event.json` | Stored in Sentry with `[email]` and `[phone]` in the message, and `email`, `phone` and `note` context keys as `[redacted]`. No user identity, IP address, request data or hostname. **The note text in the message got through** ("Renewal call went badly"): OBS-003 |
| Unhandled error in a route | `sentry-event-unhandled.json` | Arrived only through the reporter (`where: onRequestError`), scrubbed the same way. No raw event: Sentry holds 2 events for the 2 errors |
| What Sentry adds itself | both event files | `user.geo` with the sender's city, derived from the uploading machine's IP (redacted in these files before publishing): OBS-004. Sentry's own server-side scrubber also replaced `path` and `route` with `[Filtered]` because they contain "auth" |
| Alert | `alert-fired.txt`, `sentry-alert-rule.json` | New issue first seen 06:15:26 UTC; rule triggered 06:15:49 UTC |
| Uptime alerting on `/api/health` | `alert-fired.txt` | Not possible yet: there's no deployed URL to watch. Moved to "Fix before first deploy" (OBS-002, uptime) |

## 7. Evidence kept

Everything above is in `evidence/lab-09/`. No file contains the DSN or the auth token; this was checked before committing.

## 8. Done when

- [x] Server errors reach Sentry, and only through the scrubber (both test events).
- [x] Email and phone in a message or context never reach Sentry (`sentry-event.json`).
- [ ] Free-text personal data in an error message never reaches Sentry (OBS-003, open).
- [x] A new issue triggers an email to the owner (rule triggered 06:15:49 UTC).
- [ ] An outage of `/api/health` alerts the owner (needs a deployment; OBS-002 uptime).

## Open after this lab

- **OBS-003:** the scrubber matches patterns (emails, phone numbers, quoted values), so a sentence such as a note's text inside an error message passes through.
- **OBS-004:** turn on "Prevent storing of IP addresses" in the Sentry project.
- **Browser errors** aren't reported at all; adding the browser SDK would need the same scrutiny.
- **Next.js's dev server** still prints raw error messages to the terminal, outside the reporter, as the build log already noted.
- **Default Sentry alert:** the project also has Sentry's built-in "Send a notification for high priority issues" rule, which also fires for new issues Sentry rates high priority (both first test issues were rated high).
