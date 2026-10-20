"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { initialFormState, type FormState } from "@/lib/forms";

type Props = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  pendingLabel?: string;
  children: ReactNode;
  resetOnSuccess?: boolean;
  className?: string;
};

/** A form bound to a server action, showing validation and server errors. */
export function ActionForm({ action, submitLabel, pendingLabel, children, resetOnSuccess, className }: Props) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  const fieldErrors = Object.values(state.fieldErrors ?? {});

  return (
    <form ref={ref} action={formAction} className={className ?? "stack"} noValidate>
      {children}
      {fieldErrors.length > 0 ? (
        <ul className="error small" role="alert">
          {fieldErrors.map((msg) => (
            <li key={msg}>{msg}</li>
          ))}
        </ul>
      ) : null}
      {state.error ? (
        <p className="error small" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok && state.message ? <p className="success small">{state.message}</p> : null}
      <div>
        <button type="submit" disabled={pending}>
          {pending ? (pendingLabel ?? "Saving…") : submitLabel}
        </button>
      </div>
    </form>
  );
}
