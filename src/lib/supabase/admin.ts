import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { supabasePublicEnv, supabaseServiceEnv } from "@/lib/env";

/**
 * Client with the Supabase secret key (the service_role database role). It
 * BYPASSES row-level security, so it is used only for the few server-side
 * jobs that have no user session: rate limiting, the Stripe webhook, the AI
 * quota and the health check. Never use it to serve a user's request for data.
 */
export function createAdminClient() {
  const { NEXT_PUBLIC_SUPABASE_URL } = supabasePublicEnv();
  const { SUPABASE_SECRET_KEY } = supabaseServiceEnv();
  return createClient<Database>(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
