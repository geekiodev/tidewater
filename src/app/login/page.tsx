import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { safeNextPath } from "@/lib/access";
import { HOME_PATH } from "@/lib/routes";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const rawNext = typeof params.next === "string" ? params.next : undefined;
  const next = rawNext ? safeNextPath(rawNext, HOME_PATH) : undefined;

  if (await getSessionUser()) redirect(next ?? HOME_PATH);

  const signupHref = next?.startsWith("/invite/") ? `/signup?next=${encodeURIComponent(next)}` : "/signup";

  return (
    <main>
      <section className="auth-box card stack">
        <h1>Log in to Tidewater</h1>
        {params.error === "link" ? (
          <p className="error">That link is invalid or has expired. Log in, or sign up again.</p>
        ) : null}
        <LoginForm next={next} />
        <p className="small muted">
          No account yet? <Link href={signupHref}>Sign up</Link>
        </p>
      </section>
    </main>
  );
}
