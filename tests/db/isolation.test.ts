import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  adminQuery,
  asAnon,
  asService,
  asUser,
  closePool,
  createUser,
  DENIED,
  setSubscription,
  type TestUser,
} from "./helpers";

/**
 * Workspace isolation, run against a real Postgres with the real migrations
 * and RLS policies. Workspace A (owner + member) and workspace B (owner) each
 * have a client, a contact and a note. Every test tries to reach across.
 */

let ownerA: TestUser;
let memberA: TestUser;
let ownerB: TestUser;
let wsA: string;
let wsB: string;
const rows = {} as {
  clientA: string;
  clientB: string;
  contactB: string;
  noteB: string;
  noteByOwnerA: string;
  noteByMemberA: string;
};

async function seedClient(user: TestUser, workspaceId: string, name: string) {
  return asUser(user.id, async (c) => {
    const client = await c.query<{ id: string }>(
      "insert into public.clients (workspace_id, name, created_by) values ($1, $2, $3) returning id",
      [workspaceId, name, user.id],
    );
    const clientId = client.rows[0].id;
    const contact = await c.query<{ id: string }>(
      "insert into public.contacts (workspace_id, client_id, full_name, email, phone) values ($1, $2, $3, $4, $5) returning id",
      [workspaceId, clientId, `${name} Contact`, "person@example.test", "+1 555 0100"],
    );
    const note = await c.query<{ id: string }>(
      "insert into public.notes (workspace_id, client_id, body, author_id) values ($1, $2, $3, $4) returning id",
      [workspaceId, clientId, `Private note about ${name}`, user.id],
    );
    return { clientId, contactId: contact.rows[0].id, noteId: note.rows[0].id };
  });
}

beforeAll(async () => {
  ownerA = await createUser({ workspaceName: "Agency A" });
  ownerB = await createUser({ workspaceName: "Agency B" });
  memberA = await createUser();
  wsA = ownerA.workspaceId!;
  wsB = ownerB.workspaceId!;
  await addMember(wsA, memberA.id, "member");
  await setSubscription(wsA, "active");
  await setSubscription(wsB, "active");

  const a = await seedClient(ownerA, wsA, "Client A");
  const b = await seedClient(ownerB, wsB, "Client B");
  rows.clientA = a.clientId;
  rows.noteByOwnerA = a.noteId;
  rows.clientB = b.clientId;
  rows.contactB = b.contactId;
  rows.noteB = b.noteId;
  rows.noteByMemberA = await asUser(memberA.id, async (c) => {
    const r = await c.query<{ id: string }>(
      "insert into public.notes (workspace_id, client_id, body, author_id) values ($1, $2, 'member note', $3) returning id",
      [wsA, rows.clientA, memberA.id],
    );
    return r.rows[0].id;
  });
});

afterAll(async () => {
  await closePool();
});

describe("sign-up and membership", () => {
  it("creates a workspace with the new user as owner at sign-up", async () => {
    const r = await adminQuery<{ role: string; name: string }>(
      "select m.role, w.name from public.workspace_members m join public.workspaces w on w.id = m.workspace_id where m.user_id = $1",
      [ownerA.id],
    );
    expect(r.rows).toEqual([{ role: "owner", name: "Agency A" }]);
  });

  it("does not create a workspace when signing up without a workspace name (invited users)", async () => {
    const u = await createUser();
    expect(u.workspaceId).toBeNull();
  });

  it("each user sees only their own workspace and its members", async () => {
    const seen = await asUser(ownerA.id, async (c) => {
      const ws = await c.query("select id from public.workspaces");
      const members = await c.query("select user_id from public.workspace_members");
      return { ws: ws.rows.map((r) => r.id), members: members.rows.map((r) => r.user_id).sort() };
    });
    expect(seen.ws).toEqual([wsA]);
    expect(seen.members).toEqual([ownerA.id, memberA.id].sort());
  });

  it("list_workspace_members returns only the caller's workspace", async () => {
    const emails = await asUser(ownerB.id, async (c) => {
      const r = await c.query<{ email: string }>("select email from public.list_workspace_members()");
      return r.rows.map((x) => x.email);
    });
    expect(emails).toEqual([ownerB.email]);
  });
});

describe("cross-workspace reads are impossible", () => {
  for (const table of ["clients", "contacts", "notes"]) {
    it(`workspace A cannot read workspace B's ${table}`, async () => {
      const r = await asUser(ownerA.id, (c) => c.query(`select workspace_id from public.${table}`));
      expect(r.rows.length).toBeGreaterThan(0);
      expect(r.rows.every((row) => row.workspace_id === wsA)).toBe(true);
    });
  }

  it("filtering by another workspace's id returns nothing", async () => {
    const r = await asUser(ownerA.id, (c) =>
      c.query("select id from public.clients where workspace_id = $1 or id = $2", [wsB, rows.clientB]),
    );
    expect(r.rows).toEqual([]);
  });

  it("workspace A cannot read workspace B's invitations or AI usage", async () => {
    await adminQuery(
      "insert into public.workspace_invitations (workspace_id, email, token_hash, invited_by) values ($1, 'x@example.test', $2, $3)",
      [wsB, createHash("sha256").update(randomBytes(8)).digest("hex"), ownerB.id],
    );
    await adminQuery("insert into public.ai_usage (workspace_id, month, briefs) values ($1, date_trunc('month', now())::date, 3)", [wsB]);
    const r = await asUser(ownerA.id, async (c) => ({
      inv: (await c.query("select id from public.workspace_invitations")).rows,
      usage: (await c.query("select * from public.ai_usage")).rows,
    }));
    expect(r.inv).toEqual([]);
    expect(r.usage).toEqual([]);
  });
});

describe("cross-workspace writes are impossible", () => {
  it("cannot insert a client into another workspace", async () => {
    await expect(
      asUser(ownerA.id, (c) =>
        c.query("insert into public.clients (workspace_id, name, created_by) values ($1, 'x', $2)", [wsB, ownerA.id]),
      ),
    ).rejects.toThrow(DENIED);
  });

  it("cannot attach a contact in its own workspace to another workspace's client", async () => {
    await expect(
      asUser(ownerA.id, (c) =>
        c.query("insert into public.contacts (workspace_id, client_id, full_name) values ($1, $2, 'Mallory')", [
          wsA,
          rows.clientB,
        ]),
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it("cannot add a note to another workspace's client", async () => {
    await expect(
      asUser(ownerA.id, (c) =>
        c.query("insert into public.notes (workspace_id, client_id, body, author_id) values ($1, $2, 'x', $3)", [
          wsB,
          rows.clientB,
          ownerA.id,
        ]),
      ),
    ).rejects.toThrow(DENIED);
  });

  it("updates and deletes aimed at another workspace affect zero rows", async () => {
    const counts = await asUser(ownerA.id, async (c) => ({
      upd: (await c.query("update public.clients set name = 'pwned' where id = $1", [rows.clientB])).rowCount,
      updContact: (await c.query("update public.contacts set full_name = 'pwned' where id = $1", [rows.contactB]))
        .rowCount,
      delNote: (await c.query("delete from public.notes where id = $1", [rows.noteB])).rowCount,
      delClient: (await c.query("delete from public.clients where id = $1", [rows.clientB])).rowCount,
    }));
    expect(counts).toEqual({ upd: 0, updContact: 0, delNote: 0, delClient: 0 });
    const still = await adminQuery("select name from public.clients where id = $1", [rows.clientB]);
    expect(still.rows[0].name).toBe("Client B");
  });

  it("cannot move a row to another workspace (workspace_id is not updatable)", async () => {
    await expect(
      asUser(ownerA.id, (c) => c.query("update public.clients set workspace_id = $1 where id = $2", [wsB, rows.clientA])),
    ).rejects.toThrow(DENIED);
  });

  it("cannot rename another workspace", async () => {
    const r = await asUser(ownerA.id, (c) => c.query("update public.workspaces set name = 'x' where id = $1", [wsB]));
    expect(r.rowCount).toBe(0);
  });
});

describe("roles and access control", () => {
  it("owner can rename their workspace; a member cannot", async () => {
    const owner = await asUser(ownerA.id, (c) =>
      c.query("update public.workspaces set name = 'Agency A' where id = $1", [wsA]),
    );
    expect(owner.rowCount).toBe(1);
    const member = await asUser(memberA.id, (c) =>
      c.query("update public.workspaces set name = 'Member was here' where id = $1", [wsA]),
    );
    expect(member.rowCount).toBe(0);
  });

  it("nobody can change subscription fields from the browser role, not even the owner", async () => {
    await expect(
      asUser(ownerA.id, (c) =>
        c.query("update public.workspaces set subscription_status = 'active', plan = 'team' where id = $1", [wsA]),
      ),
    ).rejects.toThrow(DENIED);
  });

  it("members cannot invite; owners can", async () => {
    const hash = () => createHash("sha256").update(randomBytes(16)).digest("hex");
    await expect(
      asUser(memberA.id, (c) =>
        c.query(
          "insert into public.workspace_invitations (workspace_id, email, token_hash, invited_by) values ($1, 'new@example.test', $2, $3)",
          [wsA, hash(), memberA.id],
        ),
      ),
    ).rejects.toThrow(DENIED);
    const ok = await asUser(ownerA.id, (c) =>
      c.query(
        "insert into public.workspace_invitations (workspace_id, email, token_hash, invited_by) values ($1, 'new@example.test', $2, $3)",
        [wsA, hash(), ownerA.id],
      ),
    );
    expect(ok.rowCount).toBe(1);
  });

  it("members cannot remove anyone; owners cannot remove themselves", async () => {
    const byMember = await asUser(memberA.id, (c) =>
      c.query("delete from public.workspace_members where user_id = $1", [ownerA.id]),
    );
    expect(byMember.rowCount).toBe(0);
    const self = await asUser(ownerA.id, (c) =>
      c.query("delete from public.workspace_members where user_id = $1", [ownerA.id]),
    );
    expect(self.rowCount).toBe(0);
  });

  it("members cannot promote themselves to owner", async () => {
    await expect(
      asUser(memberA.id, (c) => c.query("update public.workspace_members set role = 'owner' where user_id = $1", [memberA.id])),
    ).rejects.toThrow(DENIED);
  });

  it("only a note's author can edit it; the owner can delete a member's note", async () => {
    const edit = await asUser(memberA.id, (c) =>
      c.query("update public.notes set body = 'edited' where id = $1", [rows.noteByOwnerA]),
    );
    expect(edit.rowCount).toBe(0);
    const memberDeletesOwners = await asUser(memberA.id, (c) =>
      c.query("delete from public.notes where id = $1", [rows.noteByOwnerA]),
    );
    expect(memberDeletesOwners.rowCount).toBe(0);
    const ownerDeletesMembers = await asUser(ownerA.id, (c) =>
      c.query("delete from public.notes where id = $1", [rows.noteByMemberA]),
    );
    expect(ownerDeletesMembers.rowCount).toBe(1);
  });

  it("signed-out (anon) requests can read nothing", async () => {
    for (const table of ["workspaces", "workspace_members", "clients", "contacts", "notes", "ai_usage"]) {
      await expect(asAnon((c) => c.query(`select * from public.${table}`))).rejects.toThrow(DENIED);
    }
  });

  it("server-only functions cannot be called by signed-in users", async () => {
    const calls = [
      "select public.rate_limit_hit('x', 1000, 60)",
      `select public.apply_stripe_event('evt_x', 't', now(), '${wsA}', null, null, 'active', 'team', null)`,
      `select public.reserve_ai_brief('${wsA}', 1000000)`,
      `select public.settle_ai_brief('${wsA}', false, 0, 0)`,
      "select * from private.rate_limits",
      "select * from private.stripe_events",
    ];
    for (const sql of calls) {
      await expect(asUser(ownerA.id, (c) => c.query(sql)), sql).rejects.toThrow(DENIED);
    }
  });
});

describe("invitations", () => {
  async function invite(email: string, opts: { expired?: boolean } = {}) {
    const token = randomBytes(32).toString("base64url");
    const hash = createHash("sha256").update(token, "utf8").digest("hex");
    await adminQuery(
      `insert into public.workspace_invitations (workspace_id, email, token_hash, invited_by, expires_at)
       values ($1, $2, $3, $4, ${opts.expired ? "now() - interval '1 day'" : "now() + interval '7 days'"})`,
      [wsA, email, hash, ownerA.id],
    );
    return token;
  }

  it("rejects a user whose email doesn't match the invitation", async () => {
    const token = await invite("invitee1@example.test");
    const stranger = await createUser({ email: "stranger@example.test" });
    await expect(asUser(stranger.id, (c) => c.query("select public.accept_invitation($1)", [token]))).rejects.toThrow(
      /invalid_invitation/,
    );
  });

  it("rejects an unconfirmed email", async () => {
    const token = await invite("unconfirmed@example.test");
    const u = await createUser({ email: "unconfirmed@example.test", confirmed: false });
    await expect(asUser(u.id, (c) => c.query("select public.accept_invitation($1)", [token]))).rejects.toThrow(
      /email_not_confirmed/,
    );
  });

  it("rejects an expired invitation", async () => {
    const token = await invite("late@example.test", { expired: true });
    const u = await createUser({ email: "late@example.test" });
    await expect(asUser(u.id, (c) => c.query("select public.accept_invitation($1)", [token]))).rejects.toThrow(
      /invalid_invitation/,
    );
  });

  it("joins the matching user as a member, once", async () => {
    const token = await invite("invitee2@example.test");
    const u = await createUser({ email: "invitee2@example.test" });
    await asUser(u.id, (c) => c.query("select public.accept_invitation($1)", [token]));
    const m = await adminQuery("select workspace_id, role from public.workspace_members where user_id = $1", [u.id]);
    expect(m.rows).toEqual([{ workspace_id: wsA, role: "member" }]);

    await expect(asUser(u.id, (c) => c.query("select public.accept_invitation($1)", [token]))).rejects.toThrow(
      /invalid_invitation/,
    );
  });

  it("a user already in a workspace can't join another one", async () => {
    const token = await invite(ownerB.email);
    await expect(asUser(ownerB.id, (c) => c.query("select public.accept_invitation($1)", [token]))).rejects.toThrow(
      /already_in_workspace/,
    );
  });
});

describe("login rate limiting (database limiter)", () => {
  it("allows up to the limit in a window, then refuses", async () => {
    const bucket = `login:email:test-${randomBytes(4).toString("hex")}`;
    const results: boolean[] = [];
    for (let i = 0; i < 5; i++) {
      results.push(
        await asService(async (c) => {
          const r = await c.query<{ ok: boolean }>("select public.rate_limit_hit($1, 3, 900) as ok", [bucket]);
          return r.rows[0].ok;
        }),
      );
    }
    expect(results).toEqual([true, true, true, false, false]);
  });

  it("keeps buckets independent", async () => {
    const a = `login:ip:a-${randomBytes(4).toString("hex")}`;
    const b = `login:ip:b-${randomBytes(4).toString("hex")}`;
    const hit = (bucket: string) =>
      asService(async (c) => (await c.query<{ ok: boolean }>("select public.rate_limit_hit($1, 1, 900) as ok", [bucket])).rows[0].ok);
    expect(await hit(a)).toBe(true);
    expect(await hit(a)).toBe(false);
    expect(await hit(b)).toBe(true);
  });
});
