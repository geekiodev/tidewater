"use client";

import { useActionState } from "react";
import { acceptInvitationAction } from "./actions";
import { initialFormState } from "@/lib/forms";

export function AcceptInvitationForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptInvitationAction, initialFormState);
  return (
    <form action={action} className="stack">
      <input type="hidden" name="token" value={token} />
      {state.error ? <p className="error">{state.error}</p> : null}
      <button type="submit" disabled={pending}>
        {pending ? "Joining…" : "Accept invitation"}
      </button>
    </form>
  );
}
