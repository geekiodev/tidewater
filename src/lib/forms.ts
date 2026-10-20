import type { z } from "zod";

/** State returned by server actions to the forms that call them. */
export type FormState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  message?: string;
};

export const initialFormState: FormState = {};

export function formDataToObject(formData: FormData, fields: readonly string[]): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const f of fields) {
    const v = formData.get(f);
    out[f] = typeof v === "string" ? v : undefined;
  }
  return out;
}

export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
