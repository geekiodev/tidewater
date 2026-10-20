"use client";

import { useState } from "react";

type Brief = { summary: string; emailSubject: string; emailBody: string; truncated?: boolean };

function isBrief(v: unknown): v is Brief {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.summary === "string" && typeof o.emailSubject === "string" && typeof o.emailBody === "string";
}

/**
 * "Brief me" panel. The model's output is shown ONLY as text: React escapes
 * it, nothing is parsed as HTML or Markdown, and no links are made
 * clickable. Copy puts plain text on the clipboard.
 */
export function BriefPanel({ clientId, enabled }: { clientId: string; enabled: boolean }) {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function run() {
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch(`/api/clients/${encodeURIComponent(clientId)}/brief`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          typeof data === "object" && data !== null && typeof (data as { error?: unknown }).error === "string"
            ? (data as { error: string }).error
            : "Couldn't get a brief right now.";
        setError(msg);
        return;
      }
      if (!isBrief(data)) {
        setError("Couldn't read the brief.");
        return;
      }
      setBrief(data);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function copyEmail() {
    if (!brief) return;
    const text = brief.emailSubject ? `Subject: ${brief.emailSubject}\n\n${brief.emailBody}` : brief.emailBody;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setError("Couldn't copy to the clipboard. Select the text and copy it instead.");
    }
  }

  return (
    <section className="card stack">
      <div className="row spread">
        <h2>Account brief</h2>
        <button type="button" onClick={run} disabled={!enabled || loading}>
          {loading ? "Thinking…" : brief ? "Brief me again" : "Brief me"}
        </button>
      </div>
      {!enabled ? (
        <p className="small muted">Account briefs need an active subscription.</p>
      ) : (
        <p className="small muted">
          Sends this client&apos;s name, contacts&apos; names and job titles, and recent notes to our AI provider to
          write a summary. AI output can be wrong; check it before you send anything.
        </p>
      )}
      {error ? (
        <p className="error small" role="alert">
          {error}
        </p>
      ) : null}
      {brief ? (
        <div className="stack">
          <div>
            <h3>Summary</h3>
            <pre className="plain">{brief.summary}</pre>
          </div>
          {brief.emailBody ? (
            <div className="stack">
              <h3>Suggested follow-up email</h3>
              {brief.emailSubject ? (
                <p>
                  <strong>Subject:</strong> {brief.emailSubject}
                </p>
              ) : null}
              <pre className="plain">{brief.emailBody}</pre>
              <div>
                <button type="button" className="secondary" onClick={copyEmail}>
                  {copied ? "Copied" : "Copy email"}
                </button>
              </div>
            </div>
          ) : null}
          {brief.truncated ? <p className="small muted">The brief was cut short at the length limit.</p> : null}
        </div>
      ) : null}
    </section>
  );
}
