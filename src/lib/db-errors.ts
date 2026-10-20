import "server-only";
import type { FormState } from "@/lib/forms";
import { reportError } from "@/lib/errors/report";

type DbError = { code?: string; message?: string } | null;

/**
 * Turn a database error into a safe message for the user, and report it
 * (scrubbed) for developers. Raw database messages are never shown to users.
 */
export function dbErrorState(error: DbError, where: string): FormState {
  reportError(error, { where });
  switch (error?.code) {
    case "42501": // RLS / privilege violation
      return { error: "You don't have permission to do that." };
    case "23503": // foreign key: e.g. client deleted or not in this workspace
      return { error: "That record no longer exists." };
    case "23514": // check constraint
      return { error: "One of the values is too long or invalid." };
    default:
      return { error: "Something went wrong saving your changes. Please try again." };
  }
}
