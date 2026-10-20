import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";
import { supabasePublicEnv } from "@/lib/env";

/**
 * Supabase client acting as the signed-in user (anon key + the user's session
 * cookie). Every query made with it is subject to row-level security, so it
 * can only ever see the caller's own workspace.
 */
export async function createClient() {
  // Read cookies first: this marks the route as dynamic (per-request).
  const cookieStore = await cookies();
  const env = supabasePublicEnv();

  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The proxy refreshes the session cookie on every request instead.
        }
      },
    },
  });
}
