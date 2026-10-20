/**
 * Server-side error reporting. Reports only the error's type and code plus
 * caller-supplied context, never the message body (which can contain user
 * data). Extended with full scrubbing in a later step.
 */
export function reportError(err: unknown, context: Record<string, string | number | boolean> = {}) {
  const e = err as { name?: string; code?: string } | null;
  console.error(
    JSON.stringify({
      level: "error",
      at: new Date().toISOString(),
      name: e?.name ?? typeof err,
      code: e?.code,
      ...context,
    }),
  );
}
