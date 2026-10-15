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
  Promise<{ ok: true; githubId: number; isPrivate: boolean; canPush: boolean; defaultBranch: string | null } | { ok: false; error: string }> {
  try {
    const r = await gh(`/repos/${owner}/${name}`, token);
    if (r.status === 404) return { ok: false, error: `${owner}/${name} not found or not accessible with this account` };
    if (r.status === 401) return { ok: false, error: "Account token is invalid or expired" };
    if (r.status === 403) return { ok: false, error: `Access to ${owner}/${name} was denied for this account` };
    if (!r.ok) return { ok: false, error: `GitHub returned ${r.status}` };
    const d = await r.json();
    return { ok: true, githubId: d.id, isPrivate: !!d.private, canPush: !!d.permissions?.push, defaultBranch: d.default_branch ?? null };
  } catch {
    return { ok: false, error: "Could not reach GitHub" };
  }
}

export function repoUrl(owner: string, name: string) {
  return `https://github.com/${owner}/${name}.git`;
}

const MAX_PAGES = 10;

async function paginate<T>(path: string, token: string): Promise<{ ok: true; items: T[] } | { ok: false; error: string }> {
  const items: T[] = [];
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const r = await gh(`${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`, token);
      if (r.status === 401) return { ok: false, error: "Account token is invalid or expired" };
      if (r.status === 403) return { ok: false, error: "GitHub denied the request — check the token's permissions" };
      if (!r.ok) return { ok: false, error: `GitHub returned ${r.status}` };
      const batch = await r.json() as T[];
      items.push(...batch);
      if (batch.length < 100) break;
    }
    return { ok: true, items };
  } catch {
    return { ok: false, error: "Could not reach GitHub" };
  }
}

export interface AccountRepo { owner: string; name: string; isPrivate: boolean; canPush: boolean }

export async function listAccountRepos(token: string) {
  type Raw = { name: string; owner: { login: string }; private: boolean; permissions?: { push?: boolean } };
  const r = await paginate<Raw>("/user/repos?affiliation=owner,collaborator,organization_member&sort=full_name", token);
  if (!r.ok) return r;
  return {
    ok: true as const,
    repos: r.items.map((x): AccountRepo => ({ owner: x.owner.login, name: x.name, isPrivate: x.private, canPush: !!x.permissions?.push })),
  };
}

export async function listBranches(token: string, owner: string, name: string) {
  const r = await paginate<{ name: string }>(`/repos/${owner}/${name}/branches`, token);
  if (!r.ok) return r;
  return { ok: true as const, branches: r.items.map(b => b.name) };
}
