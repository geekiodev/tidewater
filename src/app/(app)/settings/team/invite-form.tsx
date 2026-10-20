"use client";

import { useActionState, useState } from "react";
import { inviteMemberAction } from "./actions";
import { initialFormState } from "@/lib/forms";

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteMemberAction, initialFormState);
  const [copied, setCopied] = useState(false);

  return (
    <div className="stack">
      <form action={action} className="row" noValidate>
        <label className="grow">
          Teammate&apos;s email
          <input name="email" type="email" required maxLength={254} />
        </label>
        <button type="submit" disabled={pending} className="align-end">
          {pending ? "Creating…" : "Invite"}
        </button>
      </form>
      {state.fieldErrors?.email ? <p className="error small">{state.fieldErrors.email}</p> : null}
      {state.error ? <p className="error small">{state.error}</p> : null}
      {state.ok && state.message ? (
        <div className="banner stack">
          <span className="small">
            Invitation created. Send this link to your teammate. It works once, only for that email address, and
            expires in 7 days. It won&apos;t be shown again.
          </span>
          <code className="small break-all">
            {state.message}
          </code>
          <div>
            <button
              type="button"
              className="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(state.message ?? "");
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
