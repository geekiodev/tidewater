"use client";

import { useActionState } from "react";
import { signupAction } from "@/app/auth/actions";
import { initialFormState } from "@/lib/forms";

export function SignupForm({ inviteToken }: { inviteToken?: string }) {
  const [state, action, pending] = useActionState(signupAction, initialFormState);

  if (state.ok) {
    return <p className="success" role="status">{state.message}</p>;
  }

  return (
    <form action={action} className="stack" noValidate>
      <input type="hidden" name="mode" value={inviteToken ? "invite" : "workspace"} />
      {inviteToken ? <input type="hidden" name="inviteToken" value={inviteToken} /> : null}
      {inviteToken ? null : (
        <label>
          Agency name
          <input name="workspaceName" required maxLength={100} autoComplete="organization" />
          {state.fieldErrors?.workspaceName ? (
            <span className="error small">{state.fieldErrors.workspaceName}</span>
          ) : null}
        </label>
      )}
      <label>
        Work email
        <input name="email" type="email" autoComplete="email" required maxLength={254} />
        {state.fieldErrors?.email ? <span className="error small">{state.fieldErrors.email}</span> : null}
      </label>
      <label>
        Password
        <input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} />
        <span className="small">At least 12 characters, with upper- and lower-case letters and a digit.</span>
        {state.fieldErrors?.password ? <span className="error small">{state.fieldErrors.password}</span> : null}
      </label>
      {state.fieldErrors?.inviteToken ? <p className="error">{state.fieldErrors.inviteToken}</p> : null}
      {state.error ? <p className="error" role="alert">{state.error}</p> : null}
      <button type="submit" disabled={pending}>
        {pending ? "Creating account…" : inviteToken ? "Create account" : "Create workspace"}
      </button>
    </form>
  );
}
