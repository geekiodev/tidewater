"use client";

import { useActionState } from "react";
import { createWorkspaceAction } from "./actions";
import { initialFormState } from "@/lib/forms";

export function CreateWorkspaceForm() {
  const [state, action, pending] = useActionState(createWorkspaceAction, initialFormState);
  return (
    <form action={action} className="stack" noValidate>
      <label>
        Agency name
        <input name="name" required maxLength={100} />
        {state.fieldErrors?.name ? <span className="error small">{state.fieldErrors.name}</span> : null}
      </label>
      {state.error ? <p className="error">{state.error}</p> : null}
      <button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create workspace"}
      </button>
    </form>
  );
}
