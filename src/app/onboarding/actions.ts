"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { workspaceNameSchema } from "@/lib/validation/auth";
import { HOME_PATH } from "@/lib/routes";
import type { FormState } from "@/lib/forms";
import { reportError } from "@/lib/errors/report";

export async function createWorkspaceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const parsed = workspaceNameSchema.safeParse(formData.get("name"));
  if (!parsed.success) return { fieldErrors: { name: parsed.error.issues[0]?.message ?? "Invalid name" } };

  const supabase = await createClient();
  // The database function creates the workspace for auth.uid() as owner.
  const { error } = await supabase.rpc("create_workspace", { p_name: parsed.data });
  if (error) {
    if (error.message.includes("already_in_workspace")) redirect(HOME_PATH);
    reportError(error, { where: "create-workspace" });
    return { error: "Couldn't create the workspace. Please try again." };
  }
  redirect(HOME_PATH);
}
