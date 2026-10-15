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
- Rules: fast-forward only; one-way may force-push when `forcePush`; two-way never forces; branches never deleted; conflicts reported, not resolved.
- GitHub REST calls live in `src/lib/github.ts` (`verifyToken`, `inspectRepo`, `parseRepoRef`).
- Shared client-safe types/status styles: `src/lib/sync-shared.ts`; shared UI: `src/components/sync/SyncDisplay.tsx` (used by admin and user views).
- Admin pages: `/admin/{accounts,repositories,syncs}` (APIs under `/api/admin/{accounts,repositories,syncs}`); user page: `/user` (`/api/syncs`, any user with a role). Deleting an account/repository in use returns 409.
- No free-text inputs in sync/repository forms: repositories come from `/api/admin/accounts/repos?id=` (GitHub `/user/repos`), branches from `/api/admin/repositories/branches?id=` (union of both repos for two-way), intervals from `SYNC_INTERVALS`. Syncs have no name — they are identified by their route (`routeLabel`/`describeRoute`); one sync per source→destination pair.
- Account name defaults to the GitHub login detected from the token; there is no username input.
- User area header (`src/components/user/UserHeader.tsx`) holds the profile menu with the version.

## Roles

- Exactly two roles, defined in `src/lib/permissions.ts` (`ROLES`): `administrator` → `/admin`, `user` → `/user`. A group stores one role (`permissions` column holds `["administrator"]` or `["user"]`).
- `roleFromPermissions()` is the only parser; `homeForRole()` decides post-login redirects (local login and Azure SSO). No role → login refused (403 / `no_access`).
- Guards: `requireAdmin()` for admin pages/APIs, `requireUserArea()` for the user area (admins may view it too).
- Startup normalizes any legacy group permissions to one of the two roles.
