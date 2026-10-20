import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/access";
import { HOME_PATH } from "@/lib/routes";

/** Completes email confirmation (PKCE code exchange) and signs the user in. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNextPath(request.nextUrl.searchParams.get("next"), HOME_PATH);

  if (code && code.length <= 512) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, request.nextUrl.origin));
    }
  }
  const failed = new URL("/login", request.nextUrl.origin);
  failed.searchParams.set("error", "link");
  return NextResponse.redirect(failed);
}
