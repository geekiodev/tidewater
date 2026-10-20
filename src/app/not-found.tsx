import Link from "next/link";

export default function NotFound() {
  return (
    <main>
      <section className="auth-box card stack">
        <h1>Not found</h1>
        <p className="muted">That page doesn&apos;t exist, or you don&apos;t have access to it.</p>
        <Link href="/">Go to the home page</Link>
      </section>
    </main>
  );
}
