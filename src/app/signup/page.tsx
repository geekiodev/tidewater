import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { HOME_PATH } from "@/lib/routes";
import { inviteTokenSchema } from "@/lib/validation/auth";
import { SignupForm } from "./signup-form";

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  if (await getSessionUser()) redirect(HOME_PATH);

  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "";
  const match = /^\/invite\/([^/?#]+)$/.exec(next);
  const token = match && inviteTokenSchema.safeParse(match[1]).success ? match[1] : undefined;

  return (
    <main>
      <section className="auth-box card stack">
        <h1>{token ? "Create your account" : "Create your agency workspace"}</h1>
        {token ? (
          <p className="muted">
            Use the email address your invitation was sent to. After you confirm it, you&apos;ll be able to
            join the workspace.
          </p>
        ) : null}
        <SignupForm inviteToken={token} />
        <p className="small muted">
          Already have an account?{" "}
          <Link href={token ? `/login?next=${encodeURIComponent(next)}` : "/login"}>Log in</Link>
        </p>
      </section>
    </main>
  );
}
