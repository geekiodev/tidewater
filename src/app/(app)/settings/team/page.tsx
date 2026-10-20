import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { reportError } from "@/lib/errors/report";
import { InviteForm } from "./invite-form";
import { removeMemberAction, revokeInvitationAction } from "./actions";

export default async function TeamPage() {
  const ctx = await requireWorkspace();
  const isOwner = ctx.role === "owner";
  const supabase = await createClient();

  const { data: members, error } = await supabase.rpc("list_workspace_members");
  if (error) reportError(error, { where: "team-page:members" });

  const invitations = isOwner
    ? (
        await supabase
          .from("workspace_invitations")
          .select("id, email, created_at, expires_at")
          .is("accepted_at", null)
          .order("created_at", { ascending: false })
          .limit(50)
      ).data ?? []
    : [];

  return (
    <main>
      <h1>Team</h1>
      <section className="card">
        <h2>Members</h2>
        {error ? <p className="error">Couldn&apos;t load members. Please refresh.</p> : null}
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              {isOwner ? <th aria-label="Actions" /> : null}
            </tr>
          </thead>
          <tbody>
            {(members ?? []).map((m) => (
              <tr key={m.user_id}>
                <td>{m.email}</td>
                <td>{m.role}</td>
                {isOwner ? (
                  <td>
                    {m.user_id !== ctx.user.id ? (
                      <form action={removeMemberAction}>
                        <input type="hidden" name="userId" value={m.user_id} />
                        <button type="submit" className="danger">
                          Remove
                        </button>
                      </form>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {isOwner ? (
        <section className="card stack">
          <h2>Invite a teammate</h2>
          <InviteForm />
          {invitations.length > 0 ? (
            <>
              <h3>Pending invitations</h3>
              <table>
                <tbody>
                  {invitations.map((inv) => (
                    <tr key={inv.id}>
                      <td>{inv.email}</td>
                      <td className="small muted">
                        Expires {new Date(inv.expires_at).toLocaleDateString("en-US")}
                      </td>
                      <td>
                        <form action={revokeInvitationAction}>
                          <input type="hidden" name="invitationId" value={inv.id} />
                          <button type="submit" className="danger">
                            Revoke
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}
        </section>
      ) : (
        <p className="muted">Only the workspace owner can invite or remove teammates.</p>
      )}
    </main>
  );
}
