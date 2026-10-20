"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { inviteTokenSchema } from "@/lib/validation/auth";
import { HOME_PATH } from "@/lib/routes";
import type { FormState } from "@/lib/forms";

const MESSAGES: Record<string, string> = {
  already_in_workspace: "You already belong to a workspace. Tidewater accounts can be in one workspace at a time.",
  email_not_confirmed: "Confirm your email address first, then open this link again.",
  invalid_invitation:
    "This invitation is invalid, has expired, or was sent to a different email address than the one you're signed in with.",
};

export async function acceptInvitationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const token = inviteTokenSchema.safeParse(formData.get("token"));
  if (!token.success) return { error: MESSAGES.invalid_invitation };

  const supabase = await createClient();
  // The database checks the token, expiry and that the signed-in user's
  // confirmed email matches the invitation. The role is always "member".
  const { error } = await supabase.rpc("accept_invitation", { p_token: token.data });
  if (error) {
    const key = Object.keys(MESSAGES).find((k) => error.message.includes(k));
    return { error: key ? MESSAGES[key] : "Couldn't accept the invitation. Please try again." };
  }
  redirect(HOME_PATH);
}
