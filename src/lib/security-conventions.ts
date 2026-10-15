/**
 * Security conventions for the platform.
 *
 * Pre-push checklist — every box must pass:
 * [ ] All client input validated with zod
 * [ ] Drizzle query builder only — no string SQL concatenation
 * [ ] Every query has .limit()
 * [ ] No secrets in code or NEXT_PUBLIC_ vars
 * [ ] All mutating routes verify ownership
 * [ ] Only needed fields returned — no full DB rows with sensitive columns
 * [ ] HTTP security headers present in next.config.ts
 * [ ] No stack traces, file paths, or DB errors surfaced to client
 * [ ] Container runs as non-root user
 * [ ] No console.log of sensitive data
 */

export const SECURITY_CONVENTIONS = {
  maxQueryLimit: 100,
  // Separate cookies let an administrator and a user be signed in side by side in one browser.
  sessionCookies: { admin: "astraclone-admin-session", user: "astraclone-user-session" },
  loginRateLimit: { limit: 10, windowMs: 60_000 },
} as const;
