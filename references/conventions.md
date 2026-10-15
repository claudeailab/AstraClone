# Conventions

## CI / GitHub Actions

- `enforce-main.yml` — force-pushes any non-main branch to `main`, then triggers `build.yml` via `workflow_dispatch`
- `build.yml` — multi-arch Docker build (amd64 + arm64), push to `ghcr.io/claudeailab/astraclone`
- GHCR login uses `secrets.GITHUB_TOKEN` (`packages: write`); the package is created and linked by this repo's workflow
- Version tag format: `ghcr.io/claudeailab/astraclone:v{version}` + `:latest`

## Docker Image

- Registry: `ghcr.io/claudeailab/astraclone`
- Base: `node:22-alpine`, standalone Next.js output
- Container port: `8030` (Dockerfile `EXPOSE`/`PORT`/`HEALTHCHECK`, docker-compose, README must match)
- Multi-arch manifest via `docker buildx imagetools create`

## Environment Variables

All prefixed `ASTRACLONE_`. Never `NEXT_PUBLIC_*`. Stored server-side only.

**Core vars:** `ASTRACLONE_JWT_SECRET`, `ASTRACLONE_ADMIN_JWT_SECRET`, `ASTRACLONE_ENCRYPTION_KEY`, `ASTRACLONE_ADMIN_EMAIL`, `ASTRACLONE_ADMIN_PASSWORD`, `ASTRACLONE_DB_{HOST,PORT,USER,PASSWORD,NAME}`

**Settings overrides** — when any of these are set, `getSetting()` returns the env value instead of querying the DB. The integration appears pre-configured in the admin UI automatically. The mapping lives in `src/lib/encryption.ts` → `getEnvOverride()`.

```
# AI
ASTRACLONE_ANTHROPIC_ENABLED        → anthropic_enabled  (true/false, default true)
ASTRACLONE_ANTHROPIC_API_KEY        → anthropic_apiKey
ASTRACLONE_ANTHROPIC_MODEL          → anthropic_model
ASTRACLONE_OPENAI_ENABLED           → openai_enabled     (true/false, default true)
ASTRACLONE_OPENAI_API_KEY           → openai_apiKey
ASTRACLONE_OPENAI_MODEL             → openai_model

# Email / SMTP
ASTRACLONE_SMTP_ENABLED             → smtp_enabled       (true/false, default true)
ASTRACLONE_SMTP_HOST                → smtp_host
ASTRACLONE_SMTP_PORT                → smtp_port
ASTRACLONE_SMTP_SSL                 → smtp_ssl           (true/false)
ASTRACLONE_SMTP_USER                → smtp_user
ASTRACLONE_SMTP_PASSWORD            → smtp_password
ASTRACLONE_SMTP_FROM_NAME           → smtp_fromName
ASTRACLONE_SMTP_FROM_EMAIL          → smtp_fromEmail

# Microsoft 365
ASTRACLONE_M365_ENABLED             → m365_enabled       (true/false, default true)
ASTRACLONE_M365_CLIENT_ID           → m365_clientId
ASTRACLONE_M365_CLIENT_SECRET       → m365_clientSecret
ASTRACLONE_M365_TENANT_ID           → m365_tenantId
ASTRACLONE_M365_EXPIRY_DATE         → m365_expiryDate    (ISO date, e.g. 2026-12-31)
ASTRACLONE_M365_REMINDER_DAYS       → m365_reminderDays  (default 30)

# Stripe
ASTRACLONE_STRIPE_ENABLED           → stripe_enabled     (true/false, default true)
ASTRACLONE_STRIPE_LIVE_MODE         → stripe_liveMode    (true/false)
ASTRACLONE_STRIPE_PUBLISHABLE_KEY   → stripe_publishableKey
ASTRACLONE_STRIPE_SECRET_KEY        → stripe_secretKey
ASTRACLONE_STRIPE_WEBHOOK_SECRET    → stripe_webhookSecret

# PayPal
ASTRACLONE_PAYPAL_ENABLED           → paypal_enabled     (true/false)
ASTRACLONE_PAYPAL_LIVE_MODE         → paypal_liveMode    (true/false)
ASTRACLONE_PAYPAL_CLIENT_ID         → paypal_clientId
ASTRACLONE_PAYPAL_CLIENT_SECRET     → paypal_clientSecret

# Viva Wallet
ASTRACLONE_VIVA_ENABLED             → vivawallet_enabled  (true/false)
ASTRACLONE_VIVA_LIVE_MODE           → vivawallet_liveMode (true/false)
ASTRACLONE_VIVA_CLIENT_ID           → vivawallet_clientId
ASTRACLONE_VIVA_CLIENT_SECRET       → vivawallet_clientSecret
ASTRACLONE_VIVA_MERCHANT_ID         → vivawallet_merchantId
```

## Database

MySQL + Drizzle ORM. Table prefix: `astraclone_`. Auto-migrated on startup. AES-256-GCM encryption for all settings stored in `astraclone_settings`.

## Versioning

`version.json` is the source of truth. `package.json` and `package-lock.json` must match. Bump all three on every push.

## MCP GitHub Tools (vs curl)

Always prefer `mcp__github__*` tools over curl for GitHub API calls — the MCP server is not subject to CCR proxy restrictions. Use curl only for GHCR registry API (`ghcr.io/v2/...`) or non-Actions GitHub REST reads.

## Repository Synchronization

- Tables: `astraclone_github_connections` (token AES-encrypted), `astraclone_repositories`, `astraclone_syncs`, `astraclone_sync_runs` (last 50 per sync kept). Created in `src/instrumentation.ts`.
- Engine: `src/lib/sync-git.ts` (pure git logic, testable against local bare repos) + `src/lib/sync-engine.ts` (DB orchestration, in-process scheduler started from `instrumentation.ts`, 60s tick, one run per sync at a time, `running` rows reset to `failed` on restart).
- Git runs via `execFile` (no shell) in a bare repo under `os.tmpdir()/astraclone-sync/<syncId>`; auth header passed through `GIT_CONFIG_COUNT/KEY/VALUE` env vars — never argv or URL. Image installs `git` (`apk add git`).
- Rules: fast-forward only; one-way may force-push when `forcePush` (destination only); two-way never forces; branches never deleted; conflicts reported, not resolved.
- **Source protection (critical):** in one-way syncs the source `Remote` is forced `readOnly` inside `syncRepositories()`; `push()` throws on any read-only remote, so no code path can write to it. Same-repository syncs are refused by `sameRepository()` (GitHub repo id `repositories.github_id`, falling back to case-insensitive owner/name) in the syncs API and again in `runSync()`, and by URL in `syncRepositories()`. The destination picker disables the source's repository and read-only repositories.
- GitHub REST calls live in `src/lib/github.ts` (`verifyToken`, `inspectRepo`, `parseRepoRef`).
- Shared client-safe types/status styles: `src/lib/sync-shared.ts`; shared UI: `src/components/sync/SyncDisplay.tsx` (used by admin and user views).
- Admin pages: `/admin/accounts` and `/admin/syncs` (APIs under `/api/admin/{accounts,syncs}`); there is no repositories page — `astraclone_repositories` rows are internal: `resolveRepository()` verifies access and creates/refreshes them when a sync is saved, `pruneUnusedRepositories()` deletes rows no sync references (after sync update/delete and before account delete); user page: `/user` (`/api/syncs`, any user with a role). Deleting an account used by a sync returns 409.
- No free-text inputs in the sync form: source and destination are each an account + repository; repositories come from `/api/admin/accounts/repos?id=` (GitHub `/user/repos`), branches from `/api/admin/accounts/branches?id=&repo=owner/name` (union of both repos for two-way), intervals from `SYNC_INTERVALS`. Syncs have no name — they are identified by their route (`routeLabel`/`describeRoute`); one sync per source→destination pair.
- Account name defaults to the GitHub login detected from the token; there is no username input.
- User area header (`src/components/user/UserHeader.tsx`) holds the profile menu with the version.

## Roles

- Exactly two roles, defined in `src/lib/permissions.ts` (`ROLES`): `administrator` → `/admin`, `user` → `/user`. A group stores one role (`permissions` column holds `["administrator"]` or `["user"]`).
- `roleFromPermissions()` is the only parser; `homeForRole()` decides post-login redirects (local login and Azure SSO). No role → login refused (403 / `no_access`).
- Guards: `requireAdmin()` for admin pages/APIs, `requireUserArea()` for the user area (admins may view it too).
- Startup normalizes any legacy group permissions to one of the two roles.

## Sync state, deletions, progress

- `syncs.ref_state` (JSON `{src, dst}` of `heads/<b>`/`tags/<t>` → sha after the last run) drives `propagateDeletes` (a ref in the previous state but gone now is deleted on the other side only if that side still equals the previous source sha; `forcePush` overrides in one-way). Conflicted refs keep their previous state so they are retried. State (and the stored verification) is reset (NULL) when source, destination, direction, branches or tags change. Every sync makes the destination match the source — there is no partial/"changes only" mode (removed: exact replicas are the product's guarantee).
- `sync_runs.changes` (JSON `RefChange[]`, ≤1000 files per ref) + `files_changed`; new branches list files vs the merge-base with the other side's default branch. Served to admins and users via `/api/syncs/runs?id=`.
- Progress: `syncRepositories(..., onProgress)` reports stage + percent (git `--progress` parsed from stderr via `spawn`); kept in memory in `sync-engine.ts` and returned as `SyncOverview.progress` while running; UI polls every 3s while anything runs.

## Sessions

- Two independent session cookies (`SECURITY_CONVENTIONS.sessionCookies`): `astraclone-admin-session` and `astraclone-user-session`, so an administrator and a user can be signed in side by side in one browser. Login and Azure SSO pick the cookie from the account's role via `setSessionCookie()`.
- `getAdmin()`/`requireAdmin()` read only the admin cookie; `getUser()`/`requireSession()`/`requireUserArea()` read the user cookie, falling back to the admin cookie (admins may view `/user`). A session is rejected if the account is disabled or its role no longer matches the cookie's area.
- Logout is per area: `/api/auth/logout?area=admin|user` (no area = both). `/` is a public homepage (platform logo, name, title, "Log in" button → `/login`). Login redirects by role: administrators → `/admin`, users → `/user` (`homeForRole`). Logout returns to `/`. The login page never auto-redirects based on an existing session, so another account can always sign in.

## List layouts

- Accounts and synchronizations are compact horizontal rows inside one `Card` (`divide-y`), not card grids. Sync rows use the shared `SyncRow`: three full-width lines — route (left) · status + verification badges (right) / facts (`SyncFacts`, one line of icon+text items) / last result + timing (left) · recent-run dots (right) — with actions in their own column (admin: equal-size icon buttons Run/Verify/History/Edit/Delete; user: Details). From `md` up each line stays single-line (route and result truncate); below `md` they wrap instead of truncating. The admin `<main>` has `min-w-0` so long nowrap text can never widen the page on mobile.

## Sync form layout

- The create/edit sync dialog is two columns from `md` up (`md:max-w-3xl`, no dialog scroll: `md:max-h-none md:overflow-visible`): left = source, destination (account above repository), direction, branches; right = what to sync, interval, switches. The branch checklist keeps its own `max-h-40` scroll. Below `md` it is one column and the dialog scrolls.
- The UI calls `forcePush` "Overwrite destination changes"; keep that wording everywhere user-facing.

## Verification

- `verifyRepositories()` (sync-git) fetches both sides (read-only) and compares every in-scope branch/tag id; differing ids are re-checked by tree id (`<sha>^{tree}`) to distinguish "files identical, history differs". Destination-only refs count as differences. Result: `Verification` (`identical` | `files_identical` | `different` | `error`) with per-ref `differences`.
- Runs automatically at the end of every sync (progress 80–100%) and on demand via `POST /api/admin/syncs/verify` (`verifySync()`; no run row, does not change `last_status`). Stored in `syncs.verification` (latest) and `sync_runs.verification` (per run). The engine lock (`active` map: "sync" | "verify") prevents a sync and a verification from overlapping.
- UI: `VerificationBadge` on every sync row (admin + user), `VerificationPanel` in admin History and user Details, per-run summary in run history.

## Status colour discipline

- A sync row shows ONE status (`SyncHealth`): sync status + verification collapsed into the single most relevant label with a small dot — "Exact replica" / "Files identical" (green dot, neutral text), "Not identical" / "Conflict" (amber), "Failed" / "Verification failed" (red), "Syncing" / "Verifying" (spinner, primary), "Not run yet" / "In sync · not verified" (muted). Colour is reserved for states needing attention; healthy rows stay neutral.
- Configuration facts (`SyncFacts`, including "Overwrites destination") are always neutral muted text — settings are not warnings.
- Row actions are ghost icon buttons; Run uses the primary text colour, Delete is muted and turns red only on hover. Same on the accounts list. Filled badges (`SyncStatusBadge`, `VerificationBadge`) are used only inside detail views (history, verification panel).
