# CLAUDE.md — webapp

## Rules (non-negotiable)

- **Never assign tasks to the user.** When something is unclear or missing, investigate — read the code, trace the data, check the logs, look it up. The user is here to be helped, not to do the work. If a blocker is genuinely unresolvable without a decision only the user can make, ask a single precise question — never a list of tasks.
- Always build after changes; run GitHub Actions after every push
- Verify `main-only` ruleset at start of every session; recreate if missing
- **Mobile-first always** — no hardcoded pixel dimensions anywhere
- Modern, intuitive, elegant UI — no over-engineering
- **Complete removal** when deleting anything — no dead code, orphaned files, stale references
- Absolute visual and behavioural consistency — enforced via `ui-conventions.ts`
- Version shown in admin sidebar and user profile menu only — nowhere else
- Version bumped with every push; commit message format: `v{version} - short description`
- At the start of every session, verify `version.json` matches `package.json`; every version bump must update both files together in the same commit
- Never push the same change twice — use `git push` only, never `mcp__github__push_files` for code changes
- Each push must produce exactly 2 workflow runs: **Enforce Main Branch** and **Build and Push**. If more appear, find and fix the cause before continuing
- Aggressively minimize GitHub Actions runtime: BuildKit cache, GHA layer cache, path filters, concurrency groups
- **After every resolved issue**: update the webapp skill (`references/steps.md` and `references/conventions.md`) so the fix is captured for future sessions

## Tech Stack

- Next.js (App Router), TypeScript, TailwindCSS, shadcn/ui
- Drizzle ORM + MySQL
- bcrypt, nodemailer, stripe, @anthropic-ai/sdk, openai
- M365: @azure/msal-node + @microsoft/microsoft-graph-client

## ENV Prefix

`ASTRACLONE_` — all secrets here, never `NEXT_PUBLIC_*`

## CCR Proxy Restrictions (Claude Code Remote)

The remote execution environment proxies outbound HTTPS and blocks specific GitHub API paths:

- `/repos/.../actions/secrets/...` — **blocked**
- `/repos/.../actions/variables/...` — **blocked**
- `/orgs/...` — **blocked**
- `api.github.com/graphql` — **blocked**
- `gh secret set` / `gh variable set` — **blocked** (goes through same proxy)

**What works:** MCP `mcp__github__*` tools, GHCR registry API (`ghcr.io/v2/...`), basic REST reads via curl.

## Storing a GitHub Actions Secret from CCR

When the proxy blocks the secrets API, use a bootstrap workflow:

1. Push a temporary `workflow_dispatch`-only workflow via `mcp__github__push_files` directly to `main`:
   ```yaml
   name: Bootstrap Secret
   on:
     workflow_dispatch:
       inputs:
         t:
           description: 'token'
           required: true
   jobs:
     run:
       runs-on: ubuntu-latest
       steps:
         - name: set
           env:
             GH_TOKEN: ${{ inputs.t }}
             T: ${{ inputs.t }}
           run: |
             echo "::add-mask::$T"
             printf '%s' "$T" | gh secret set SECRET_NAME --repo owner/repo
   ```
2. Trigger it via `mcp__github__actions_run_trigger` with the token as input.
3. Once complete, the secret is set. The bootstrap workflow is auto-removed when the feature branch is next force-pushed to main by `enforce-main.yml`.

## GHCR Auth

`build.yml` uses `secrets.GITHUB_TOKEN` (with `packages: write`) for both GHCR login steps. `ghcr.io/claudeailab/astraclone` is created by this repo's own workflow, so it is linked to the repo and `GITHUB_TOKEN` can push to it — no PAT secret needed.
