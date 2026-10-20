import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { inviteTokenSchema } from "@/lib/validation/auth";
import { AcceptInvitationForm } from "./accept-form";

// Accepting happens on an explicit POST (the form), never on GET, so link
// previews and prefetches can't consume an invitation.
export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const user = await requireUser();
  const { token } = await params;
  if (!inviteTokenSchema.safeParse(token).success) notFound();

  return (
    <main>
      <section className="auth-box card stack">
        <h1>Join a workspace</h1>
        <p className="muted">
          You&apos;re signed in as <strong>{user.email}</strong>. The invitation must have been sent to this
          address.
        </p>
        <AcceptInvitationForm token={token} />
      </section>
    </main>
  );
}
