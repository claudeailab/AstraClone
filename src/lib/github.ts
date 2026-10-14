const API = "https://api.github.com";

export const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
export const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;

export function parseRepoRef(input: string): { owner: string; name: string } | null {
  const cleaned = input.trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "").replace(/\/+$/, "");
  const [owner, name, ...rest] = cleaned.split("/");
  if (rest.length || !owner || !name || !OWNER_RE.test(owner) || !REPO_RE.test(name) || name === "." || name === "..") return null;
  return { owner, name };
}

async function gh(path: string, token: string) {
  return fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "astraclone",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
}

export async function verifyToken(token: string): Promise<{ ok: true; login: string; scopes: string } | { ok: false; error: string }> {
  try {
    const r = await gh("/user", token);
    if (r.status === 401) return { ok: false, error: "Token is invalid or expired" };
    if (!r.ok) return { ok: false, error: `GitHub returned ${r.status}` };
    const d = await r.json();
    return { ok: true, login: d.login, scopes: r.headers.get("x-oauth-scopes") ?? "" };
  } catch {
    return { ok: false, error: "Could not reach GitHub" };
  }
}

export async function inspectRepo(token: string, owner: string, name: string):
  Promise<{ ok: true; isPrivate: boolean; canPush: boolean; defaultBranch: string | null } | { ok: false; error: string }> {
  try {
    const r = await gh(`/repos/${owner}/${name}`, token);
    if (r.status === 404) return { ok: false, error: `${owner}/${name} not found or not accessible with this account` };
    if (r.status === 401) return { ok: false, error: "Account token is invalid or expired" };
    if (r.status === 403) return { ok: false, error: `Access to ${owner}/${name} was denied for this account` };
    if (!r.ok) return { ok: false, error: `GitHub returned ${r.status}` };
    const d = await r.json();
    return { ok: true, isPrivate: !!d.private, canPush: !!d.permissions?.push, defaultBranch: d.default_branch ?? null };
  } catch {
    return { ok: false, error: "Could not reach GitHub" };
  }
}

export function repoUrl(owner: string, name: string) {
  return `https://github.com/${owner}/${name}.git`;
}
