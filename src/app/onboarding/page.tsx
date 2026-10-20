import { redirect } from "next/navigation";
import { getWorkspaceContext, requireUser } from "@/lib/auth";
import { HOME_PATH } from "@/lib/routes";
import { logoutAction } from "@/app/auth/actions";
import { CreateWorkspaceForm } from "./create-workspace-form";

export default async function OnboardingPage() {
  await requireUser();
  if (await getWorkspaceContext()) redirect(HOME_PATH);

  return (
    <main>
      <section className="auth-box card stack">
        <h1>You&apos;re not in a workspace yet</h1>
        <p className="muted">
          If a teammate invited you, open the invitation link they sent. Otherwise, create a workspace for your
          agency.
        </p>
        <CreateWorkspaceForm />
        <form action={logoutAction}>
          <button type="submit" className="secondary">
            Log out
          </button>
        </form>
      </section>
    </main>
  );
}
