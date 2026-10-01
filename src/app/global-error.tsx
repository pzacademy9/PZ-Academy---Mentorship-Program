"use client";

/* Replaces the root layout when it crashes, so it renders its own <html>
   and cannot rely on Tailwind tokens or providers. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#F7FAF5", color: "#0F3D22" }}>
        <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }}>
          <div style={{ maxWidth: 420, textAlign: "center" }}>
            <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Something went wrong</h1>
            <p style={{ margin: "0 0 20px", color: "#196432" }}>Please try again in a moment.</p>
            <button
              onClick={reset}
              style={{ minHeight: 44, padding: "0 20px", borderRadius: 10, border: 0, background: "#194B32", color: "#fff", fontSize: 16 }}
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
