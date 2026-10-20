import type { Instrumentation } from "next";
import { reportError } from "@/lib/errors/report";

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
