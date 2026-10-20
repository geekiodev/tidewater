import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { WorkspaceRole } from "@/lib/database.types";

export type SessionUser = { id: string; email: string | null };

export type WorkspaceContext = {
  user: SessionUser;
  workspace: { id: string; name: string };
  role: WorkspaceRole;
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
    .select("role, workspace:workspaces!inner(id, name)")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data) return null;
  const workspace = Array.isArray(data.workspace) ? data.workspace[0] : data.workspace;
  if (!workspace) return null;
  return { user, workspace: { id: workspace.id, name: workspace.name }, role: data.role };
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
