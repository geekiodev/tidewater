"use client";

import { useActionState } from "react";
import { initialFormState } from "@/lib/forms";
import { openBillingPortalAction, startCheckoutAction } from "./actions";

export function CheckoutButton({ plan, label }: { plan: string; label: string }) {
  const [state, action, pending] = useActionState(startCheckoutAction, initialFormState);
  return (
    <form action={action} className="stack">
      <input type="hidden" name="plan" value={plan} />
      <button type="submit" disabled={pending}>
        {pending ? "Redirecting…" : `Subscribe to ${label}`}
      </button>
      {state.error ? <p className="error small">{state.error}</p> : null}
    </form>
  );
}

export function PortalButton() {
  const [state, action, pending] = useActionState(openBillingPortalAction, initialFormState);
  return (
    <form action={action} className="stack">
      <button type="submit" className="secondary" disabled={pending}>
        {pending ? "Opening…" : "Manage billing"}
      </button>
      {state.error ? <p className="error small">{state.error}</p> : null}
    </form>
  );
}
