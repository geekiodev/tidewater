import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { WorkspaceRole } from "@/lib/database.types";
import { isSubscriptionActive } from "@/lib/billing/plans";

export type SessionUser = { id: string; email: string | null };

export type WorkspaceContext = {
  user: SessionUser;
  workspace: {
    id: string;
    name: string;
    plan: "starter" | "team" | null;
    subscriptionStatus: string;
    currentPeriodEnd: string | null;
    hasStripeCustomer: boolean;
  };
  role: WorkspaceRole;
  /** Active subscription: required to create records and use the AI brief. */
  active: boolean;
};

/**
 * The signed-in user, verified with the Supabase Auth server (getUser checks
 * the token rather than trusting the cookie contents). Cached per request.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * The caller's workspace and role, looked up in the database for the
 * verified user. Nothing here comes from the browser.
 */
export const getWorkspaceContext = cache(async (): Promise<WorkspaceContext | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspace_members")
    .select(
      "role, workspace:workspaces!inner(id, name, plan, subscription_status, current_period_end, stripe_customer_id)",
    )
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data) return null;
  const workspace = Array.isArray(data.workspace) ? data.workspace[0] : data.workspace;
  if (!workspace) return null;
  return {
    user,
    workspace: {
      id: workspace.id,
      name: workspace.name,
      plan: workspace.plan,
      subscriptionStatus: workspace.subscription_status,
      currentPeriodEnd: workspace.current_period_end,
      hasStripeCustomer: !!workspace.stripe_customer_id,
    },
    role: data.role,
    active: isSubscriptionActive(workspace.subscription_status, workspace.plan),
  };
});

/** For pages and actions: signed-in user with a workspace, or redirect. */
export async function requireWorkspace(): Promise<WorkspaceContext> {
  await requireUser();
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/onboarding");
  return ctx;
}

export class AuthorizationError extends Error {
  constructor(message = "Not allowed") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export async function requireOwner(): Promise<WorkspaceContext> {
  const ctx = await requireWorkspace();
  if (ctx.role !== "owner") throw new AuthorizationError("Only the workspace owner can do this");
  return ctx;
}

export const SUBSCRIPTION_REQUIRED_MESSAGE =
  "Your workspace doesn't have an active subscription. You can still view your data; ask the owner to subscribe on the Billing page to add new records.";
