import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser, getWorkspaceContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { idSchema } from "@/lib/validation/crm";
import { hitRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { anthropicEnv } from "@/lib/env";
import { reportError } from "@/lib/errors/report";
import { BRIEF_LIMITS, parseBriefOutput, selectBriefFields } from "@/lib/ai/brief";
import { Anthropic, generateBrief } from "@/lib/ai/anthropic";

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * POST /api/clients/:id/brief
 * Returns { summary, emailSubject, emailBody } as plain strings.
 */
export async function POST(_request: NextRequest, { params }: RouteContext<"/api/clients/[id]/brief">) {
  // 1. Who is calling? Session, workspace and subscription all come from the server.
  if (!(await getSessionUser())) return fail(401, "Not signed in.");
  const ctx = await getWorkspaceContext();
  if (!ctx) return fail(403, "You're not in a workspace.");
  if (!ctx.active) return fail(402, "Account briefs need an active subscription.");

  const { id: rawId } = await params;
  const id = idSchema.safeParse(rawId);
  if (!id.success) return fail(404, "Client not found.");

  let monthlyLimit: number;
  try {
    monthlyLimit = anthropicEnv().AI_MONTHLY_BRIEF_LIMIT;
  } catch (err) {
    reportError(err, { where: "brief:config" });
    return fail(503, "The account brief isn't configured on this server.");
  }

  // 2. Rate limits (per user and per workspace).
  const [userOk, wsOk] = await Promise.all([
    hitRateLimit(RATE_LIMITS.briefPerUser, ctx.user.id),
    hitRateLimit(RATE_LIMITS.briefPerWorkspace, ctx.workspace.id),
  ]);
  if (!userOk || !wsOk) return fail(429, "Too many briefs requested. Please wait a minute and try again.");

  // 3. Load only what the brief needs, through the user's RLS-bound client.
  const supabase = await createClient();
  const { data: client } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", id.data)
    .eq("workspace_id", ctx.workspace.id)
    .maybeSingle();
  if (!client) return fail(404, "Client not found.");

  const [contactsRes, notesRes] = await Promise.all([
    supabase
      .from("contacts")
      .select("full_name, job_title")
      .eq("client_id", client.id)
      .eq("workspace_id", ctx.workspace.id)
      .order("full_name")
      .limit(BRIEF_LIMITS.maxContacts),
    supabase
      .from("notes")
      .select("body, created_at")
      .eq("client_id", client.id)
      .eq("workspace_id", ctx.workspace.id)
      .order("created_at", { ascending: false })
      .limit(BRIEF_LIMITS.maxNotes),
  ]);
  if (contactsRes.error || notesRes.error) {
    reportError(contactsRes.error ?? notesRes.error, { where: "brief:load" });
    return fail(500, "Couldn't load the client's data.");
  }

  const payload = selectBriefFields({
    clientName: client.name,
    contacts: contactsRes.data ?? [],
    notes: notesRes.data ?? [],
  });

  // 4. Monthly cap, reserved atomically before the call (service role only).
  const admin = createAdminClient();
  const { data: reserved, error: reserveError } = await admin.rpc("reserve_ai_brief", {
    p_workspace_id: ctx.workspace.id,
    p_monthly_limit: monthlyLimit,
  });
  if (reserveError) {
    reportError(reserveError, { where: "brief:reserve" });
    return fail(500, "Couldn't check your AI usage. Please try again.");
  }
  if (!reserved) return fail(429, "Your workspace has used all of this month's account briefs.");

  // 5. Call the model (timeout and max output tokens set in generateBrief).
  try {
    const result = await generateBrief(payload);
    await admin.rpc("settle_ai_brief", {
      p_workspace_id: ctx.workspace.id,
      p_succeeded: true,
      p_input_tokens: result.inputTokens,
      p_output_tokens: result.outputTokens,
    });
    const brief = parseBriefOutput(result.text);
    return NextResponse.json(
      { ...brief, truncated: result.truncated },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    await admin.rpc("settle_ai_brief", {
      p_workspace_id: ctx.workspace.id,
      p_succeeded: false,
      p_input_tokens: 0,
      p_output_tokens: 0,
    });
    reportError(err, { where: "brief:model" });
    if (err instanceof Anthropic.APIConnectionTimeoutError) return fail(504, "The AI took too long to answer. Try again.");
    if (err instanceof Anthropic.RateLimitError) return fail(503, "The AI service is busy. Try again shortly.");
    return fail(502, "The AI service couldn't produce a brief right now.");
  }
}
