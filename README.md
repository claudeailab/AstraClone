# AstraClone

Keeps GitHub repositories in sync. Add GitHub accounts and repositories, define which repository synchronizes to which (one-way or two-way, which branches, how often), and AstraClone monitors and synchronizes them continuously. Users get a live status dashboard; admins manage everything from the admin panel.

## Features

### Repository Synchronization
- **GitHub Accounts** (`/admin/accounts`): paste a personal access token — the GitHub username is detected automatically; tokens are encrypted and verified on save ("Test" button)
- **Synchronizations** (`/admin/syncs`): everything is chosen from lists — source and destination are each an account plus one of the repositories that account can access (access and push permission are verified on save), direction, branches (all, or a checklist loaded from GitHub), check interval, tags, enable/pause, optional force push (one-way only); "Run now" and full run history with per-branch details
- **One-way**: the source is strictly read-only — it is only fetched from, and the engine refuses any push to it. New branches and tags are created on the destination and branches are fast-forwarded; if the destination has commits the source doesn't, the branch is reported as a conflict and left untouched (unless force push is on)
- **Two-way**: whichever side is ahead is fast-forwarded into the other; new branches and tags are copied both ways; branches changed on both sides are reported as conflicts and never overwritten
- **What to sync**: *Everything* (destination matches the source) or *Only changes from now on* (the first run records a starting point; afterwards only branches/tags that change are synced, existing differences are left alone)
- **Deletions**: optionally delete branches/tags in the destination when they are deleted in the source (two-way: mirrored both ways). A ref is only deleted if the other side has no commits of its own on it — otherwise it is kept and reported as a conflict. Deleted *files* always follow their commits.
- **Live progress**: running syncs show the current stage (fetching, comparing, pushing…) and a percentage, in both admin and user areas
- **Changed files**: every run records each branch/tag that was created, updated, force-updated or deleted, with the files added (A), modified (M), renamed (R) and deleted (D)
- **User area** (`/user`): every synchronization with its status (in sync / conflict / failed / running), direction, branches, interval, last result, next run and recent run history
- Source and destination can never be the same GitHub repository (checked by GitHub repository ID when saving and before every run, even if it was added under two accounts)
- Branches are never deleted; credentials are passed to `git` via environment, never via the command line or URLs

**Token permissions:** classic PAT with `repo` scope, or fine-grained PAT with Contents read/write on the repositories. Add the `workflow` scope (classic) or Workflows write (fine-grained) if synchronized branches change files under `.github/workflows`.

### Auth & Users
- Local email/password auth (bcrypt, session tokens)
- Azure AD / Microsoft 365 SSO (MSAL + Microsoft Graph)
- Two roles, assigned through groups: **Administrator** (admin area, `/admin`) and **User** (user area, `/user`); accounts without a role cannot sign in
- Auto-seeds first admin from environment variables
- In-memory rate limiting on login
- Separate admin and user sessions: an administrator and a user can be signed in at the same time in one browser (different tabs), each surviving reloads and logging out independently

### Admin Panel
- Sidebar navigation with feature-flag gating
- User management: create, edit, delete, assign groups
- Azure AD directory browser + bulk sync
- Permission group editor with JSON-array permissions
- Audit log with paginated history (every login, create, update, delete)
- Full platform branding: name, title, icon (Iconify), primary color (live preview)
- Light / dark / system theme switcher

### AI
- Anthropic (Claude) API key + model configuration
- OpenAI API key + model configuration
- Connection test from admin UI

### Payments
- Stripe: secret key, public key, webhook secret, subscription plan editor
- PayPal: client ID + secret, sandbox/live toggle
- Viva Wallet: merchant ID + API key
- All tested directly from admin UI

### Email (SMTP)
- Host, port, user, password, from address
- Test email from admin UI

### M365 / Azure AD
- Client ID, client secret, tenant ID + secret expiry tracking
- Full user sync (bulk upsert from Azure directory)
- Connection test from admin UI

### Subscriptions & Plans
- Plan editor: name, monthly/yearly price, feature list
- Stripe price ID linkage per plan (monthly + yearly)
- Active/inactive toggle

### Security
- AES-256-GCM encryption for all settings stored in database
- Zod input validation on all API routes
- Drizzle query builder only (no raw SQL concatenation)
- HTTP security headers: `X-Frame-Options`, `X-Content-Type-Options`, `CSP`, `Referrer-Policy`, `Permissions-Policy`
- No `NEXT_PUBLIC_*` env vars — all secrets server-side only
- Container runs as non-root user

### Infrastructure
- PWA: service worker + dynamic manifest
- Startup health checks with ASCII status table
- Multi-arch Docker image (amd64 + arm64)
- Database auto-migration on startup (no manual step)

---

## Getting Started

Add the service to your `docker-compose.yml` and define the variables in a `.env` file alongside it.

```yaml
services:
  astraclone:
    image: ghcr.io/claudeailab/astraclone
    container_name: astraclone
    hostname: astraclone
    restart: unless-stopped
    user: "0"
    environment:
      TZ: ${TZ}

      ASTRACLONE_JWT_SECRET: ${ASTRACLONE_JWT_SECRET}
      ASTRACLONE_ENCRYPTION_KEY: ${ASTRACLONE_ENCRYPTION_KEY}
      ASTRACLONE_ADMIN_JWT_SECRET: ${ASTRACLONE_ADMIN_JWT_SECRET}

      ASTRACLONE_ADMIN_USERNAME: ${ASTRACLONE_ADMIN_USERNAME}
      ASTRACLONE_ADMIN_PASSWORD: ${ASTRACLONE_ADMIN_PASSWORD}

      ASTRACLONE_DB_HOST: ${ASTRACLONE_DB_HOST}
      ASTRACLONE_DB_PORT: ${ASTRACLONE_DB_PORT}
      ASTRACLONE_DB_USER: ${ASTRACLONE_DB_USER}
      ASTRACLONE_DB_NAME: ${ASTRACLONE_DB_NAME}
      ASTRACLONE_DB_PASSWORD: ${ASTRACLONE_DB_PASSWORD}

      ASTRACLONE_SMTP_ENABLED: ${ASTRACLONE_SMTP_ENABLED}
      ASTRACLONE_SMTP_SSL: ${ASTRACLONE_SMTP_SSL}
      ASTRACLONE_SMTP_HOST: ${ASTRACLONE_SMTP_HOST}
      ASTRACLONE_SMTP_PORT: ${ASTRACLONE_SMTP_PORT}
      ASTRACLONE_SMTP_USER: ${ASTRACLONE_SMTP_USER}
      ASTRACLONE_SMTP_PASSWORD: ${ASTRACLONE_SMTP_PASSWORD}
      ASTRACLONE_SMTP_FROM_NAME: ${ASTRACLONE_SMTP_FROM_NAME}
      ASTRACLONE_SMTP_FROM_EMAIL: ${ASTRACLONE_SMTP_FROM_EMAIL}

      ASTRACLONE_M365_ENABLED: ${ASTRACLONE_M365_ENABLED}
      ASTRACLONE_M365_CLIENT_ID: ${ASTRACLONE_M365_CLIENT_ID}
      ASTRACLONE_M365_TENANT_ID: ${ASTRACLONE_M365_TENANT_ID}
      ASTRACLONE_M365_CLIENT_SECRET: ${ASTRACLONE_M365_CLIENT_SECRET}
      ASTRACLONE_M365_EXPIRY_DATE: ${ASTRACLONE_M365_EXPIRY_DATE}
      ASTRACLONE_M365_REMINDER_DAYS: ${ASTRACLONE_M365_REMINDER_DAYS}

      ASTRACLONE_STRIPE_ENABLED: ${ASTRACLONE_STRIPE_ENABLED}
      ASTRACLONE_STRIPE_LIVE_MODE: ${ASTRACLONE_STRIPE_LIVE_MODE}
      ASTRACLONE_STRIPE_PUBLISHABLE_KEY: ${ASTRACLONE_STRIPE_PUBLISHABLE_KEY}
      ASTRACLONE_STRIPE_SECRET_KEY: ${ASTRACLONE_STRIPE_SECRET_KEY}
      ASTRACLONE_STRIPE_WEBHOOK_SECRET: ${ASTRACLONE_STRIPE_WEBHOOK_SECRET}

      ASTRACLONE_ANTHROPIC_ENABLED: ${ASTRACLONE_ANTHROPIC_ENABLED}
      ASTRACLONE_ANTHROPIC_MODEL: ${ASTRACLONE_ANTHROPIC_MODEL}
      ASTRACLONE_ANTHROPIC_API_KEY: ${ASTRACLONE_ANTHROPIC_API_KEY}

      ASTRACLONE_OPENAI_ENABLED: ${ASTRACLONE_OPENAI_ENABLED}
      ASTRACLONE_OPENAI_MODEL: ${ASTRACLONE_OPENAI_MODEL}
      ASTRACLONE_OPENAI_API_KEY: ${ASTRACLONE_OPENAI_API_KEY}
    ports:
      - 8030:8030
    volumes:
      - ./config/astraclone/data:/data
    networks:
      - network
    depends_on:
      mysql:
        condition: service_healthy
    healthcheck:
      test:
        - CMD
        - wget
        - -qO
        - /dev/null
        - http://127.0.0.1:8030/api/health
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 30s
```

---

## Updating

```bash
docker compose pull && docker compose up -d
```

---

## Environment Variables

Setting any of these env vars pre-configures that integration in the admin UI — no manual entry needed. The env value always takes precedence over anything saved in the database. Configured secrets show a prominent **Configured** badge inside the field in the UI.

| Variable | Description |
|---|---|
| `TZ` | Timezone (e.g. `UTC`) |
| `ASTRACLONE_JWT_SECRET` | Session signing secret |
| `ASTRACLONE_ADMIN_JWT_SECRET` | Admin JWT signing secret |
| `ASTRACLONE_ENCRYPTION_KEY` | 64-char hex key for AES-256-GCM settings encryption |
| `ASTRACLONE_ADMIN_USERNAME` | Seeds first admin user on first boot (used as login username) |
| `ASTRACLONE_ADMIN_PASSWORD` | Seeds first admin password on first boot |
| `ASTRACLONE_DB_HOST` | MySQL host |
| `ASTRACLONE_DB_PORT` | MySQL port (default: `3306`) |
| `ASTRACLONE_DB_USER` | MySQL user |
| `ASTRACLONE_DB_PASSWORD` | MySQL password |
| `ASTRACLONE_DB_NAME` | MySQL database name |
| `ASTRACLONE_ANTHROPIC_ENABLED` | Enable Anthropic (`true`/`false`, default `true`) |
| `ASTRACLONE_ANTHROPIC_API_KEY` | Anthropic API key |
| `ASTRACLONE_ANTHROPIC_MODEL` | Anthropic model (default: `claude-sonnet-4-6`) |
| `ASTRACLONE_OPENAI_ENABLED` | Enable OpenAI (`true`/`false`, default `true`) |
| `ASTRACLONE_OPENAI_API_KEY` | OpenAI API key |
| `ASTRACLONE_OPENAI_MODEL` | OpenAI model (default: `gpt-4o`) |
| `ASTRACLONE_SMTP_ENABLED` | Enable SMTP email (`true`/`false`, default `true`) |
| `ASTRACLONE_SMTP_HOST` | SMTP hostname |
| `ASTRACLONE_SMTP_PORT` | SMTP port |
| `ASTRACLONE_SMTP_SSL` | SMTP TLS (`true`/`false`) |
| `ASTRACLONE_SMTP_USER` | SMTP username |
| `ASTRACLONE_SMTP_PASSWORD` | SMTP password |
| `ASTRACLONE_SMTP_FROM_NAME` | Sender display name |
| `ASTRACLONE_SMTP_FROM_EMAIL` | Sender email address |
| `ASTRACLONE_M365_ENABLED` | Enable Microsoft 365 (`true`/`false`, default `true`) |
| `ASTRACLONE_M365_CLIENT_ID` | Azure app client ID |
| `ASTRACLONE_M365_CLIENT_SECRET` | Azure app client secret |
| `ASTRACLONE_M365_TENANT_ID` | Azure tenant ID |
| `ASTRACLONE_M365_EXPIRY_DATE` | Secret expiry date (ISO, e.g. `"2027-01-01"`) |
| `ASTRACLONE_M365_REMINDER_DAYS` | Days before expiry to remind (default: `30`) |
| `ASTRACLONE_STRIPE_ENABLED` | Enable Stripe (`true`/`false`, default `true`) |
| `ASTRACLONE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `ASTRACLONE_STRIPE_SECRET_KEY` | Stripe secret key |
| `ASTRACLONE_STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `ASTRACLONE_STRIPE_LIVE_MODE` | Stripe live mode (`true`/`false`) |
| `ASTRACLONE_PAYPAL_ENABLED` | Enable PayPal (`true`/`false`) |
| `ASTRACLONE_PAYPAL_CLIENT_ID` | PayPal client ID |
| `ASTRACLONE_PAYPAL_CLIENT_SECRET` | PayPal client secret |
| `ASTRACLONE_PAYPAL_LIVE_MODE` | PayPal live mode (`true`/`false`) |
| `ASTRACLONE_VIVA_ENABLED` | Enable Viva Wallet (`true`/`false`) |
| `ASTRACLONE_VIVA_CLIENT_ID` | Viva Wallet client ID |
| `ASTRACLONE_VIVA_CLIENT_SECRET` | Viva Wallet client secret |
| `ASTRACLONE_VIVA_MERCHANT_ID` | Viva Wallet merchant ID |
| `ASTRACLONE_VIVA_LIVE_MODE` | Viva Wallet live mode (`true`/`false`) |
