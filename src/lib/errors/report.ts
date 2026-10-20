/**
 * Server-side error reporting with personal data stripped.
 *
 * Reports go to the configured sink (by default: one JSON line on stderr,
 * which shows up in the dev terminal and in any log drain). To send them to a
 * service such as Sentry later, call setErrorSink() once at startup. Whatever
 * the sink, it only ever receives the scrubbed event built here.
 *
 * What is removed:
 *  - context values under keys that can hold personal data (name, email,
 *    phone, note body, ...), replaced with "[redacted]"
 *  - email addresses and phone-number-like sequences anywhere in strings
 *  - Postgres error details, which echo row values ("Key (email)=(...)")
 *  - error `cause`, request bodies and anything not explicitly listed below
 */

export type ErrorEvent = {
  level: "error";
  at: string;
  name: string;
  code?: string;
  message: string;
  stack?: string;
  context: Record<string, string | number | boolean | null>;
};

export type ErrorSink = (event: ErrorEvent) => void;

const defaultSink: ErrorSink = (event) => {
  console.error(JSON.stringify(event));
};

let sink: ErrorSink = defaultSink;

export function setErrorSink(next: ErrorSink | null) {
  sink = next ?? defaultSink;
}

const PII_KEYS = new Set([
  "name",
  "fullname",
  "full_name",
  "firstname",
  "lastname",
  "email",
  "phone",
  "body",
  "note",
  "notes",
  "text",
  "content",
  "jobtitle",
  "job_title",
  "website",
  "q",
  "query",
  "search",
  "password",
  "token",
  "address",
]);

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// 7+ digits, optionally separated by spaces, dots, dashes, parentheses; optional leading +
const PHONE_RE = /\+?\(?\d[\d\s().-]{5,}\d/g;
// Postgres "Key (col)=(value)" fragments and generic "=(...)" echoes
const PG_DETAIL_RE = /\)=\([^)]*\)/g;
// Quoted values, e.g. invalid input syntax for type uuid: "..."
const QUOTED_RE = /"[^"]{0,500}"/g;
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

const MAX_LEN = 1000;

export function scrubString(input: string): string {
  // UUIDs are kept (they're useful for debugging and aren't personal data);
  // protect them from the phone pattern before scrubbing.
  const uuids: string[] = [];
  let s = input.replace(UUID_RE, (m) => {
    uuids.push(m);
    return `\u0000${uuids.length - 1}\u0000`;
  });
  s = s
    .replace(EMAIL_RE, "[email]")
    .replace(PG_DETAIL_RE, ")=([redacted])")
    .replace(QUOTED_RE, '"[redacted]"')
    .replace(PHONE_RE, "[phone]");
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => uuids[Number(i)] ?? "");
  return s.length > MAX_LEN ? `${s.slice(0, MAX_LEN)}…` : s;
}

export function scrubContext(context: Record<string, unknown>): ErrorEvent["context"] {
  const out: ErrorEvent["context"] = {};
  for (const [key, value] of Object.entries(context)) {
    if (PII_KEYS.has(key.toLowerCase())) {
      out[key] = "[redacted]";
    } else if (typeof value === "number" || typeof value === "boolean" || value === null) {
      out[key] = value;
    } else if (typeof value === "string") {
      out[key] = scrubString(value);
    } else {
      // Objects/arrays could hold anything; don't serialise them.
      out[key] = `[${Array.isArray(value) ? "array" : typeof value}]`;
    }
  }
  return out;
}

export function buildErrorEvent(err: unknown, context: Record<string, unknown> = {}): ErrorEvent {
  const e = (typeof err === "object" && err !== null ? err : {}) as {
    name?: unknown;
    code?: unknown;
    message?: unknown;
    stack?: unknown;
  };
  const name = typeof e.name === "string" ? e.name : typeof err;
  const message = typeof e.message === "string" ? e.message : typeof err === "string" ? err : "";
  const stack =
    typeof e.stack === "string"
      ? // keep only the frame lines ("at ..."), not the message line(s) on top
        e.stack
          .split("\n")
          .filter((l) => l.trim().startsWith("at "))
          .slice(0, 15)
          .join("\n")
      : undefined;

  return {
    level: "error",
    at: new Date().toISOString(),
    name: scrubString(name),
    code: typeof e.code === "string" || typeof e.code === "number" ? scrubString(String(e.code)) : undefined,
    message: scrubString(message),
    stack: stack ? scrubString(stack) : undefined,
    context: scrubContext(context),
  };
}

export function reportError(err: unknown, context: Record<string, unknown> = {}): void {
  try {
    sink(buildErrorEvent(err, context));
  } catch {
    // Reporting must never throw into the request path.
  }
}
