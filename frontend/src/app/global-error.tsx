"use client";

// global-error renders only when the root layout itself throws — so we
// can't rely on layout.tsx, fonts, or globals.css. Plain inline styles
// only. This is the last line of defence.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          backgroundColor: "#0c0c0b",
          color: "#f0ede6",
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 480 }}>
          <div style={{ color: "#c9a84c", fontSize: "0.75rem", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: "1rem" }}>
            Application error
          </div>
          <h1 style={{ fontSize: "1.75rem", margin: "0 0 1rem", lineHeight: 1.2 }}>
            Something went very wrong.
          </h1>
          <p style={{ color: "#8a8780", fontSize: "0.95rem", lineHeight: 1.7, marginBottom: "1.5rem" }}>
            The page couldn&apos;t be rendered. Please refresh, or come back in a moment.
          </p>
          {/* Plain anchor on purpose: global-error renders when the Next.js
              client may be broken, so we can't rely on next/link routing. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            style={{
              display: "inline-block",
              padding: "0.75rem 1.5rem",
              backgroundColor: "#c9a84c",
              color: "#0c0c0b",
              borderRadius: 9999,
              textDecoration: "none",
              fontWeight: 500,
              fontSize: "0.875rem",
            }}
          >
            Reload home
          </a>
          {error.digest && (
            <p style={{ marginTop: "2rem", fontSize: "0.7rem", color: "#5a5855" }}>
              Error ID: <span style={{ fontFamily: "ui-monospace, monospace" }}>{error.digest}</span>
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
