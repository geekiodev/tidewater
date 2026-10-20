"use client";

/** Generic error screen. Details are reported server-side (scrubbed), never shown here. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main>
      <section className="auth-box card stack">
        <h1>Something went wrong</h1>
        <p className="muted">The error has been logged. Please try again.</p>
        <div>
          <button type="button" onClick={() => reset()}>
            Try again
          </button>
        </div>
      </section>
    </main>
  );
}
