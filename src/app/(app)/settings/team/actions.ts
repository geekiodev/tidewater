"use server";

import { revalidatePath } from "next/cache";
import { AuthorizationError, requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { inviteSchema, uuidSchema } from "@/lib/validation/auth";
import { generateInviteToken, hashInviteToken } from "@/lib/invitations";
import { appEnv } from "@/lib/env";
import { formDataToObject, zodFieldErrors, type FormState } from "@/lib/forms";
import { reportError } from "@/lib/errors/report";

async function ownerOrError() {
  try {
    return { ctx: await requireOwner() };
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: e.message };
    throw e;
  }
}

export async function inviteMemberAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { ctx, error } = await ownerOrError();
  if (!ctx) return { error };

  const parsed = inviteSchema.safeParse(formDataToObject(formData, ["email"]));
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error) };

  const token = generateInviteToken();
  const supabase = await createClient();
  // workspace_id and invited_by come from the server-side context; RLS checks
  // again that the caller owns this workspace.
  const { error: dbError } = await supabase.from("workspace_invitations").insert({
    workspace_id: ctx.workspace.id,
    email: parsed.data.email,
    token_hash: hashInviteToken(token),
    invited_by: ctx.user.id,
  });

  if (dbError) {
    if (dbError.code === "23505") {
      return { error: "There's already a pending invitation for that email. Revoke it first to send a new one." };
    }
    reportError(dbError, { where: "invite-member" });
    return { error: "Couldn't create the invitation. Please try again." };
  }

  revalidatePath("/settings/team");
  const link = new URL(`/invite/${token}`, appEnv().APP_URL).toString();
  return {
    ok: true,
    message: link,
  };
}

export async function revokeInvitationAction(formData: FormData): Promise<void> {
  const { ctx } = await ownerOrError();
  if (!ctx) return;
  const id = uuidSchema.safeParse(formData.get("invitationId"));
  if (!id.success) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("workspace_invitations")
    .delete()
    .eq("id", id.data)
    .eq("workspace_id", ctx.workspace.id);
  if (error) reportError(error, { where: "revoke-invitation" });
  revalidatePath("/settings/team");
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const { ctx } = await ownerOrError();
  if (!ctx) return;
  const userId = uuidSchema.safeParse(formData.get("userId"));
  if (!userId.success || userId.data === ctx.user.id) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("user_id", userId.data)
    .eq("workspace_id", ctx.workspace.id);
  if (error) reportError(error, { where: "remove-member" });
  revalidatePath("/settings/team");
}
