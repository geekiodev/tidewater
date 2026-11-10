import "server-only";
import { randomUUID } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { setErrorSink, type ErrorEvent } from "@/lib/errors/report";

/**
 * Sends error reports to Sentry, but only the scrubbed events built by
 * reportError(). Every automatic Sentry feature that could capture data on
 * its own is switched off, and beforeSend drops any event that didn't come
 * through this sink (marked with a per-process random tag that is removed
 * before sending).
 *
 * Not sent: request data, IP addresses, the server's hostname, breadcrumbs,
 * session replay, traces or logs. The scrubbed event also still goes to
 * stderr, as before.
 */

const MARK_TAG = "tidewater.via_sink";

export function toSentryEvent(event: ErrorEvent, mark: string): Sentry.Event {
  return {
    level: "error",
    message: `${event.name}: ${event.message}`,
    fingerprint: [event.name, event.message],
    timestamp: Date.parse(event.at) / 1000,
    tags: { [MARK_TAG]: mark, ...(event.code ? { code: event.code } : {}) },
    extra: { stack: event.stack ?? null, ...event.context },
  };
}

/** beforeSend: keep only events marked by this sink, and strip the mark. */
export function keepOnlySinkEvents(event: Sentry.ErrorEvent, mark: string): Sentry.ErrorEvent | null {
  if (event.tags?.[MARK_TAG] !== mark) return null;
  const tags = { ...event.tags };
  delete tags[MARK_TAG];
  return { ...event, tags };
}

export function initSentrySink(dsn: string): void {
  const mark = randomUUID();

  Sentry.init({
    dsn,
    // SDK v11 replaced sendDefaultPii with dataCollection, which defaults to
    // collecting everything. Turn every category off.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      mcp: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      frameContextLines: 0,
    },
    defaultIntegrations: false,
    integrations: [],
    enableRuntimeChannelInjection: false,
    includeServerName: false,
    maxBreadcrumbs: 0,
    sendClientReports: false,
    // No tracesSampleRate: tracing stays off. "static" makes the
    // beforeSendTransaction filter below apply (the default "stream" ignores it).
    traceLifecycle: "static",
    beforeBreadcrumb: () => null,
    beforeSendTransaction: () => null,
    beforeSend: (event) => keepOnlySinkEvents(event, mark),
  });

  setErrorSink((event) => {
    console.error(JSON.stringify(event));
    Sentry.captureEvent(toSentryEvent(event, mark));
  });
}
