import { describe, expect, it } from "vitest";
import { buildErrorEvent } from "@/lib/errors/report";
import { keepOnlySinkEvents, toSentryEvent } from "@/lib/errors/sentry-sink";

const MARK = "test-mark";

describe("Sentry sink", () => {
  it("sends only the scrubbed event", () => {
    const scrubbed = buildErrorEvent(new Error("Failed for jane@example.com, phone 555-010-4477"), {
      email: "jane@example.com",
      phone: "555-010-4477",
      note: "Renewal call went badly",
      route: "/clients/[id]",
    });
    const json = JSON.stringify(toSentryEvent(scrubbed, MARK));
    expect(json).not.toContain("jane@example.com");
    expect(json).not.toContain("555-010-4477");
    expect(json).not.toContain("Renewal call went badly");
    expect(json).toContain("/clients/[id]");
  });

  it("drops events that didn't come through the sink", () => {
    expect(keepOnlySinkEvents({ type: undefined, message: "raw" }, MARK)).toBeNull();
    expect(keepOnlySinkEvents({ type: undefined, tags: { "tidewater.via_sink": "other" } }, MARK)).toBeNull();
  });

  it("keeps sink events and strips the mark", () => {
    const kept = keepOnlySinkEvents({ type: undefined, tags: { "tidewater.via_sink": MARK, code: "23505" } }, MARK);
    expect(kept?.tags).toEqual({ code: "23505" });
  });
});
