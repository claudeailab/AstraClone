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

## Running the full app locally in CCR

Start `dockerd` (sudo), run `mysql:8.4` via Docker, `npm run build`, then `npx next start -p 8030` with the `ASTRACLONE_DB_*`, `ASTRACLONE_ENCRYPTION_KEY`, `ASTRACLONE_ADMIN_*` env vars. Server-side `fetch` needs `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt` in CCR (the proxy also injects its own GitHub auth, so any token string verifies as the proxy's identity). Never point a test sync at two different real repositories.

## Bumping the Version

Update all three files atomically:
- `version.json` — `.version`
- `package.json` — `.version`
- `package-lock.json` — both `.version` fields (use `replace_all: true`)

Commit format: `v{version} - short description`
