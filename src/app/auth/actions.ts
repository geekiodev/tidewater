"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginSchema, signupSchema } from "@/lib/validation/auth";
import { clientIp, hitRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { safeNextPath } from "@/lib/access";
import { appEnv } from "@/lib/env";
import { HOME_PATH } from "@/lib/routes";
import { formDataToObject, zodFieldErrors, type FormState } from "@/lib/forms";
import { reportError } from "@/lib/errors/report";

const TOO_MANY = "Too many attempts. Please wait a few minutes and try again.";

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(formDataToObject(formData, ["email", "password", "next"]));
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error) };
  const { email, password, next } = parsed.data;

  const ip = await clientIp();
  const [ipOk, emailOk] = await Promise.all([
    hitRateLimit(RATE_LIMITS.loginPerIp, ip),
    hitRateLimit(RATE_LIMITS.loginPerEmail, email),
  ]);
  if (!ipOk || !emailOk) return { error: TOO_MANY };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // One generic message, so the form doesn't reveal which emails have accounts.
    return {
      error: "Email or password is incorrect. If you've just signed up, confirm your email first.",
    };
  }
  redirect(safeNextPath(next, HOME_PATH));
}

export async function signupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = formDataToObject(formData, ["mode", "email", "password", "workspaceName", "inviteToken"]);
  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error) };
  const input = parsed.data;

  if (!(await hitRateLimit(RATE_LIMITS.signupPerIp, await clientIp()))) return { error: TOO_MANY };

  const { APP_URL } = appEnv();
  const next = input.mode === "invite" ? `/invite/${input.inviteToken}` : HOME_PATH;
  const callback = new URL("/auth/callback", APP_URL);
  callback.searchParams.set("next", next);

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: callback.toString(),
      // Read by the database trigger that creates the workspace. Invited users
      // don't get a workspace of their own; they join the inviting one.
      data: input.mode === "workspace" ? { workspace_name: input.workspaceName } : {},
    },
  });

  if (error) {
    if (error.code === "weak_password") {
      return { fieldErrors: { password: "Use a mix of upper- and lower-case letters and digits." } };
    }
    reportError(error, { where: "signup" });
    return { error: "We couldn't create your account. Please try again." };
  }

  // Same response whether or not the email already had an account.
  return {
    ok: true,
    message: "Check your inbox for a confirmation link to finish signing up.",
  };
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
