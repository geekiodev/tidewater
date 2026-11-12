import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { clientInputSchema, contactInputSchema } from "@/lib/validation/crm";
import { addMember, adminQuery, asUser, closePool, createUser, setSubscription, type TestUser } from "./helpers";

/**
 * Fixes for AUTHZ-001 and VALID-001 (audit/review-g2.1-g2.6.md), tested the
 * way the Supabase Data API runs a request: as the signed-in role with the
 * user's JWT claims, so RLS and check constraints apply and zod does not.
 */

let owner: TestUser;
let member: TestUser;
let ws: string;

const CHECK_VIOLATION = "23514";

/** Run one statement inside a savepoint; report success or the error code. */
async function attempt(c: PoolClient, sql: string, params: unknown[]): Promise<"ok" | string> {
  await c.query("savepoint attempt");
  try {
    await c.query(sql, params);
    await c.query("release savepoint attempt");
    return "ok";
  } catch (err) {
    await c.query("rollback to savepoint attempt");
    return (err as { code?: string }).code ?? "error";
  }
}

async function newClient(name: string) {
  return asUser(owner.id, async (c) => {
    const client = await c.query<{ id: string }>(
      "insert into public.clients (workspace_id, name, created_by) values ($1, $2, $3) returning id",
      [ws, name, owner.id],
    );
    const id = client.rows[0].id;
    await c.query("insert into public.contacts (workspace_id, client_id, full_name) values ($1, $2, 'Contact')", [ws, id]);
    await c.query("insert into public.notes (workspace_id, client_id, body, author_id) values ($1, $2, 'Owner note', $3)", [
      ws,
      id,
      owner.id,
    ]);
    return id;
  });
}

beforeAll(async () => {
  owner = await createUser({ workspaceName: "Review fixes agency" });
  member = await createUser();
  ws = owner.workspaceId!;
  await addMember(ws, member.id, "member");
  await setSubscription(ws, "active");
});

afterAll(async () => {
  await closePool();
});

describe("AUTHZ-001: only the owner can delete a client", () => {
  it("refuses a member's delete, so the client's notes and contacts stay", async () => {
    const clientId = await newClient("Member can't delete");
    const deleted = await asUser(member.id, async (c) => {
      // The member can't delete the owner's note directly...
      const note = (await c.query("delete from public.notes where client_id = $1", [clientId])).rowCount;
      // ...and can no longer get around that by deleting the client.
      const client = (await c.query("delete from public.clients where id = $1", [clientId])).rowCount;
      return { note, client };
    });
    expect(deleted).toEqual({ note: 0, client: 0 });
    const left = await adminQuery<{ clients: string; notes: string; contacts: string }>(
      `select (select count(*) from public.clients where id = $1) as clients,
              (select count(*) from public.notes where client_id = $1) as notes,
              (select count(*) from public.contacts where client_id = $1) as contacts`,
      [clientId],
    );
    expect(left.rows[0]).toEqual({ clients: "1", notes: "1", contacts: "1" });
  });

  it("lets the owner delete a client, with its notes and contacts", async () => {
    const clientId = await newClient("Owner can delete");
    const deleted = await asUser(owner.id, async (c) =>
      (await c.query("delete from public.clients where id = $1", [clientId])).rowCount,
    );
    expect(deleted).toBe(1);
    const left = await adminQuery<{ n: string }>("select count(*) as n from public.notes where client_id = $1", [clientId]);
    expect(left.rows[0].n).toBe("0");
  });
});

describe("VALID-001: the database enforces the zod format rules", () => {
  it("rejects the review's probe values sent straight to the Data API", async () => {
    const clientId = await newClient("Probe target");
    const results = await asUser(member.id, async (c) => {
      const contact = (await c.query<{ id: string }>("select id from public.contacts where client_id = $1", [clientId])).rows[0].id;
      return {
        javascriptWebsite: await attempt(c, "update public.clients set website = $2 where id = $1", [
          clientId,
          "javascript:alert(document.cookie)",
        ]),
        ftpWebsite: await attempt(
          c,
          "insert into public.clients (workspace_id, name, website, created_by) values ($1, 'x', $2, $3)",
          [ws, "ftp://x", member.id],
        ),
        badEmail: await attempt(c, "update public.contacts set email = $2 where id = $1", [contact, "not an email"]),
        badPhone: await attempt(c, "update public.contacts set phone = $2 where id = $1", [contact, "call me maybe!!"]),
      };
    });
    expect(results).toEqual({
      javascriptWebsite: CHECK_VIOLATION,
      ftpWebsite: CHECK_VIOLATION,
      badEmail: CHECK_VIOLATION,
      badPhone: CHECK_VIOLATION,
    });
  });

  // Each value is checked by both zod and the database; they must agree.
  const websites = [
    "https://example.com",
    "http://example.com/path?q=1",
    "HTTPS://EXAMPLE.COM",
    "https://",
    "https://exa mple.com",
    "javascript:alert(1)",
    "ftp://example.com",
    "example.com",
    "//example.com",
  ];
  const emails = [
    "jane@example.com",
    "jane.doe+tag@sub.example.co.uk",
    "o'brien@example.com",
    "not an email",
    "jane@",
    "@example.com",
    "jane@example",
    "jane..doe@example.com",
    ".jane@example.com",
    "jane.@example.com",
    "jane@-example.com",
    "jane@example.c",
  ];
  const phones = ["555-010-4477", "+1 (555) 010 4477", "555.0100 x12", "12", "call me maybe!!", "555-0100#", "1".repeat(51)];

  it("agrees with zod on websites", async () => {
    const clientId = await newClient("Website agreement");
    const db = await asUser(owner.id, async (c) => {
      const out: Record<string, boolean> = {};
      for (const w of websites) {
        out[w] = (await attempt(c, "update public.clients set website = $2 where id = $1", [clientId, w])) === "ok";
      }
      return out;
    });
    for (const w of websites) {
      expect({ value: w, db: db[w] }).toEqual({ value: w, db: clientInputSchema.safeParse({ name: "x", website: w }).success });
    }
  });

  it("agrees with zod on emails and phone numbers", async () => {
    const clientId = await newClient("Contact agreement");
    const db = await asUser(owner.id, async (c) => {
      const contact = (await c.query<{ id: string }>("select id from public.contacts where client_id = $1", [clientId])).rows[0].id;
      const email: Record<string, boolean> = {};
      const phone: Record<string, boolean> = {};
      for (const e of emails) {
        email[e] = (await attempt(c, "update public.contacts set email = $2 where id = $1", [contact, e])) === "ok";
      }
      for (const p of phones) {
        phone[p] = (await attempt(c, "update public.contacts set phone = $2 where id = $1", [contact, p])) === "ok";
      }
      return { email, phone };
    });
    for (const e of emails) {
      expect({ value: e, db: db.email[e] }).toEqual({
        value: e,
        db: contactInputSchema.safeParse({ fullName: "x", email: e }).success,
      });
    }
    for (const p of phones) {
      expect({ value: p, db: db.phone[p] }).toEqual({
        value: p,
        db: contactInputSchema.safeParse({ fullName: "x", phone: p }).success,
      });
    }
  });
});
