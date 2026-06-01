// Vitest stub for the `server-only` package. The real module throws when
// imported outside a server bundle (no react-server condition in vitest's
// node environment), which would break unit tests of modules that import it
// (turnstile, email, supabase/service). Aliased in vitest.config.ts.
export {};
