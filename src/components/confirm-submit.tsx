"use client";

import type { ReactNode } from "react";

/** Submit button that asks for confirmation before a destructive action. */
export function ConfirmSubmit({ message, children }: { message: string; children: ReactNode }) {
  return (
    <button
      type="submit"
      className="danger"
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
