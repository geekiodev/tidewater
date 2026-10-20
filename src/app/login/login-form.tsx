"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/auth/actions";
import { initialFormState } from "@/lib/forms";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(loginAction, initialFormState);
  return (
    <form action={action} className="stack" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required maxLength={254} />
        {state.fieldErrors?.email ? <span className="error small">{state.fieldErrors.email}</span> : null}
      </label>
      <label>
        Password
        <input name="password" type="password" autoComplete="current-password" required maxLength={128} />
        {state.fieldErrors?.password ? <span className="error small">{state.fieldErrors.password}</span> : null}
      </label>
      {state.error ? <p className="error" role="alert">{state.error}</p> : null}
      <button type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Log in"}
      </button>
    </form>
  );
}
