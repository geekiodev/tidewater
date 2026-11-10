import type { Instrumentation } from "next";
import { reportError } from "@/lib/errors/report";

/**
 * When SENTRY_DSN is set, scrubbed error reports also go to Sentry (Node.js
 * runtime only). See src/lib/errors/sentry-sink.ts for what is and isn't sent.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.SENTRY_DSN) {
    const { initSentrySink } = await import("@/lib/errors/sentry-sink");
    initSentrySink(process.env.SENTRY_DSN);
  }
}

/**
 * Uncaught server errors (rendering, route handlers, server actions) go
 * through the same scrubbing reporter. The query string is dropped because
 * it can contain search terms such as a person's name; headers and bodies are
 * never included.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const digest =
    typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : null;
  reportError(err, {
    where: "onRequestError",
    method: request.method,
    path: request.path.split("?")[0] ?? "",
    route: context.routePath,
    routeType: context.routeType,
    digest,
  });
};
