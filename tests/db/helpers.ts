import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";

/**
 * Helpers for running SQL exactly as Supabase's Data API would: inside a
 * transaction, as the `anon`, `authenticated` or `service_role` database role,
 * with the caller's JWT claims in `request.jwt.claims` (which auth.uid() reads).
 */

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) throw new Error("TEST_DATABASE_URL is not set");
    pool = new Pool({ connectionString: url, max: 4 });
  }
  return pool;
}

export async function closePool() {
  await pool?.end();
  pool = null;
}

type Role = "anon" | "authenticated" | "service_role";

export async function withRole<T>(role: Role, userId: string | null, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${role}`);
    const claims = userId ? { sub: userId, role } : { role };
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export const asUser = <T>(userId: string, fn: (c: PoolClient) => Promise<T>) => withRole("authenticated", userId, fn);
export const asAnon = <T>(fn: (c: PoolClient) => Promise<T>) => withRole("anon", null, fn);
export const asService = <T>(fn: (c: PoolClient) => Promise<T>) => withRole("service_role", null, fn);

/** Superuser query, for test fixtures only (simulates what Supabase Auth does). */
export async function adminQuery<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
) {
  return getPool().query<T>(sql, params);
}

export type TestUser = { id: string; email: string; workspaceId: string | null };

/** Insert an auth user the way Supabase Auth would (fires the sign-up trigger). */
export async function createUser(opts: { workspaceName?: string; confirmed?: boolean; email?: string } = {}) {
  const id = randomUUID();
  const email = opts.email ?? `user-${id.slice(0, 8)}@example.test`;
  const meta = opts.workspaceName ? { workspace_name: opts.workspaceName } : {};
  await adminQuery(
    "insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, $2, $3, $4)",
    [id, email, opts.confirmed === false ? null : new Date(), JSON.stringify(meta)],
  );
  const ws = await adminQuery<{ workspace_id: string }>(
    "select workspace_id from public.workspace_members where user_id = $1",
    [id],
  );
  return { id, email, workspaceId: ws.rows[0]?.workspace_id ?? null } satisfies TestUser;
}

export async function addMember(workspaceId: string, userId: string, role: "owner" | "member" = "member") {
  await adminQuery("insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, $3)", [
    workspaceId,
    userId,
    role,
  ]);
}

export async function setSubscription(workspaceId: string, status: string, plan: "starter" | "team" | null = "team") {
  await adminQuery("update public.workspaces set subscription_status = $2, plan = $3 where id = $1", [
    workspaceId,
    status,
    plan,
  ]);
}

/** Matches the errors Postgres raises for RLS / privilege violations. */
export const DENIED = /row-level security|permission denied/;
