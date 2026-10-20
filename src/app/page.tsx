import Link from "next/link";

export default function LandingPage() {
  return (
    <main>
      <section className="auth-box stack">
        <h1>Tidewater</h1>
        <p>
          A lightweight CRM for small agencies. Keep your clients, their people
          and your notes in one place, and get a quick brief on any account
          before you pick up the phone.
        </p>
        <div className="row">
          <Link className="button" href="/signup">
            Create a workspace
          </Link>
          <Link className="button secondary" href="/login">
            Log in
          </Link>
        </div>
      </section>
    </main>
  );
}
