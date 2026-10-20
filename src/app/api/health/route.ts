import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/health: public, unauthenticated health check for load balancers
 * and uptime monitors. Reports only ok/error per dependency: no versions,
 * hostnames, error messages or data.
 */
export async function GET() {
  let database: "ok" | "error" | "not_configured" = "ok";
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("workspaces")
      .select("id")
      .limit(1)
      .abortSignal(AbortSignal.timeout(3000));
    if (error) database = "error";
  } catch (err) {
    database = err instanceof Error && err.message.startsWith("Missing or invalid") ? "not_configured" : "error";
  }

  const healthy = database === "ok";
  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", checks: { app: "ok", database } },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
