# Operational Steps

## Storing a GitHub Actions Secret (CCR environment)

The CCR proxy blocks the GitHub Actions secrets API. Use a bootstrap workflow instead:

1. Push a minimal `workflow_dispatch` workflow to `main` via `mcp__github__push_files`
2. Trigger it via `mcp__github__actions_run_trigger` with the token as input `t`
3. The runner (not proxied) calls `gh secret set` using `GH_TOKEN: ${{ inputs.t }}`
4. Poll until `completed success`
5. The bootstrap workflow is cleaned up automatically when `enforce-main.yml` next force-pushes from the feature branch

See CLAUDE.md § "Storing a GitHub Actions Secret from CCR" for the full workflow YAML.

## Bootstrap workflow cannot carry GitHub PATs

GitHub secret scanning on the MCP tools rejects any `ghp_…` token passed as a `workflow_dispatch` input (`Secret Scanning has rejected the input`). Do not encode/obfuscate it to evade the scanner. Avoid needing a PAT secret instead (see below).

## GHCR login: `Password required` / `permission_denied`

`Password required` means the referenced secret is empty (e.g. `CR_PAT` never stored). Fix: log in with `secrets.GITHUB_TOKEN` and `permissions: packages: write`. This works because `ghcr.io/claudeailab/astraclone` is created by this repo's own workflow and is therefore linked to the repo. `permission_denied` only occurs if the package pre-exists unlinked — then link it to the repo in the package settings.

## Testing the sync engine locally

`sync-git.ts` has no DB imports, so it can be exercised against local bare repos (`git init --bare`) with `node --experimental-strip-types`: use file paths as remote URLs and no token. Cover: empty repos, create, fast-forward, destination ahead (conflict vs force), two-way reverse fast-forward, diverged (conflict), branch filter, missing remote.

## Proving one-way syncs never touch the source

Any change to `sync-git.ts` must re-run the source-protection suite: snapshot `git for-each-ref` of the source bare repo (plus a count of files modified after `config`) before and after every one-way scenario — default with a diverged destination, force push, tags, branch filter, no tags — and require identical snapshots. Also assert: destination-only branches/tags are not copied back, a `readOnly` source refuses writes even in two-way, and source == destination is refused.

## Engine test suites

Three suites run `sync-git.ts` against local bare repos (`node --experimental-strip-types`): regression (create/ff/conflict/force/two-way/filter), source protection, deletions/files/progress (deletions on/off/forced/conflicting, destination-only refs never deleted, conflict retry, two-way deletion both ways, M/A/D/R file lists, progress stages). Thread `result.state` into the next call to simulate consecutive runs. A fourth suite covers verification (empty destination, exact replica after sync, tampered destination, same tree/different commit → files identical, destination-only refs, never writes, scope respected). All must pass before pushing engine changes. For end-to-end checks through `sync-engine.ts` + MySQL, run the real modules with `npx tsx` and point `https://github.com/` at local bare repos via a `GIT_CONFIG_GLOBAL` file containing `[url "/path/"] insteadOf = https://github.com/` (symlink `node_modules` next to the script).

## Running the full app locally in CCR

Start `dockerd` (sudo), run `mysql:8.4` via Docker, `npm run build`, then `npx next start -p 8030` with the `ASTRACLONE_DB_*`, `ASTRACLONE_ENCRYPTION_KEY`, `ASTRACLONE_ADMIN_*` env vars. Server-side `fetch` needs `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt` in CCR (the proxy also injects its own GitHub auth, so any token string verifies as the proxy's identity). Never point a test sync at two different real repositories.

In CCR the proxy only allows repository-scoped GitHub endpoints, so `/user/repos` (account repository list) returns 403 there — it works with a real PAT in production. To browser-test the repository picker, stub `/api/admin/accounts/repos` with Playwright `page.route`, and create the context with `serviceWorkers: "block"` — the app's PWA service worker otherwise handles fetches and bypasses `page.route`.

## Scheduler activity not visible in the UI

Symptom: scheduled runs happened (run rows appeared) but the pages never showed them as running. Cause: Next.js instantiates `sync-engine.ts` once for `instrumentation.ts` and again for route handlers, so module-level `Map`s were separate copies. Fix: keep all in-process engine state on a `globalThis` singleton (`__astracloneSyncEngine`). Apply the same pattern to any state shared between the scheduler and API routes. Verify end-to-end: let the real scheduler start a run and poll `/api/admin/syncs` until `running: true, trigger: "schedule"` appears.

## Bumping the Version

Update all three files atomically:
- `version.json` — `.version`
- `package.json` — `.version`
- `package-lock.json` — both `.version` fields (use `replace_all: true`)

Commit format: `v{version} - short description`
