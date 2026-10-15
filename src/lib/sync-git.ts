import { execFile } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";

export interface Remote { url: string; token?: string; readOnly?: boolean }
export interface SyncConfig {
  direction: "one_way" | "two_way";
  branches: string;
  syncTags: boolean;
  forcePush: boolean;
}
export interface SyncResult { status: "success" | "conflict" | "failed"; message: string; details: string[] }

const PUSH_CHUNK = 200;

// Credentials go through GIT_CONFIG_* env vars so they never appear in argv, process lists or error messages.
function gitEnv(token?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  if (token) {
    env.GIT_CONFIG_COUNT = "1";
    env.GIT_CONFIG_KEY_0 = "http.extraHeader";
    env.GIT_CONFIG_VALUE_0 = `Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`;
  }
  return env;
}

function git(dir: string, args: string[], token?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise(resolve => {
    execFile("git", args, { cwd: dir, env: gitEnv(token), maxBuffer: 64 * 1024 * 1024, timeout: 15 * 60_000 }, (err, stdout, stderr) => {
      const c = (err as { code?: unknown } | null)?.code;
      resolve({
        code: err ? (typeof c === "number" ? c : 1) : 0,
        stdout: String(stdout).trim(),
        stderr: String(stderr).trim() || (err ? err.message : ""),
      });
    });
  });
}

async function gitOk(dir: string, args: string[], token?: string): Promise<string> {
  const r = await git(dir, args, token);
  if (r.code !== 0) {
    const lines = r.stderr.split("\n").map(l => l.trim()).filter(Boolean);
    throw new Error(lines.slice(-3).join(" ") || `git ${args[0]} failed`);
  }
  return r.stdout;
}

async function listRefs(dir: string, prefix: string): Promise<Map<string, string>> {
  const out = await gitOk(dir, ["for-each-ref", "--format=%(objectname) %(refname)", prefix]);
  const map = new Map<string, string>();
  for (const line of out.split("\n").filter(Boolean)) {
    const [sha, ref] = line.split(" ");
    map.set(ref.slice(prefix.length + 1), sha);
  }
  return map;
}

async function isAncestor(dir: string, ancestor: string, descendant: string): Promise<boolean> {
  const r = await git(dir, ["merge-base", "--is-ancestor", ancestor, descendant]);
  if (r.code === 0) return true;
  if (r.code === 1) return false;
  throw new Error(r.stderr || "merge-base failed");
}

export function branchMatcher(spec: string): (branch: string) => boolean {
  const patterns = spec.split(",").map(s => s.trim()).filter(Boolean);
  if (!patterns.length) return () => true;
  const regexes = patterns.map(p => new RegExp("^" + p.split("*").map(s => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$"));
  return b => regexes.some(r => r.test(b));
}

function filterMap(map: Map<string, string>, keep: (k: string) => boolean) {
  return new Map([...map].filter(([k]) => keep(k)));
}

async function push(dir: string, remote: Remote, refspecs: string[]) {
  if (remote.readOnly) throw new Error("Refused to write to a read-only repository");
  for (let i = 0; i < refspecs.length; i += PUSH_CHUNK) {
    await gitOk(dir, ["push", "--quiet", remote.url, ...refspecs.slice(i, i + PUSH_CHUNK)], remote.token);
  }
}

export async function syncRepositories(dir: string, sourceRemote: Remote, dest: Remote, cfg: SyncConfig): Promise<SyncResult> {
  const twoWay = cfg.direction === "two_way";
  // One-way syncs must never modify the source: it is only ever fetched from.
  const source: Remote = { ...sourceRemote, readOnly: sourceRemote.readOnly || !twoWay };
  if (source.url.toLowerCase() === dest.url.toLowerCase()) throw new Error("Source and destination are the same repository");
  try {
    await access(path.join(dir, "HEAD"));
  } catch {
    await mkdir(dir, { recursive: true });
    await gitOk(dir, ["init", "--bare", "--quiet"]);
  }

  const refspecs = (side: string) => [
    `+refs/heads/*:refs/${side}/heads/*`,
    ...(cfg.syncTags ? [`+refs/tags/*:refs/${side}/tags/*`] : []),
  ];
  await gitOk(dir, ["fetch", "--prune", "--no-tags", "--quiet", source.url, ...refspecs("src")], source.token);
  await gitOk(dir, ["fetch", "--prune", "--no-tags", "--quiet", dest.url, ...refspecs("dst")], dest.token);

  const matches = branchMatcher(cfg.branches);
  const srcHeads = filterMap(await listRefs(dir, "refs/src/heads"), matches);
  const dstHeads = filterMap(await listRefs(dir, "refs/dst/heads"), matches);

  const toDest: string[] = [];
  const toSource: string[] = [];
  const details: string[] = [];
  const conflicts: string[] = [];
  const allowForce = !twoWay && cfg.forcePush;

  const names = twoWay ? new Set([...srcHeads.keys(), ...dstHeads.keys()]) : new Set(srcHeads.keys());
  for (const b of [...names].sort()) {
    const s = srcHeads.get(b);
    const d = dstHeads.get(b);
    if (s === d) continue;
    const ref = `refs/heads/${b}`;
    if (!s) {
      if (twoWay) { toSource.push(`${d}:${ref}`); details.push(`branch ${b}: created on source`); }
      continue;
    }
    if (!d) { toDest.push(`${s}:${ref}`); details.push(`branch ${b}: created on destination`); continue; }
    if (await isAncestor(dir, d, s)) { toDest.push(`${s}:${ref}`); details.push(`branch ${b}: fast-forwarded destination`); continue; }
    if (twoWay && await isAncestor(dir, s, d)) { toSource.push(`${d}:${ref}`); details.push(`branch ${b}: fast-forwarded source`); continue; }
    if (allowForce) { toDest.push(`+${s}:${ref}`); details.push(`branch ${b}: force-updated destination`); continue; }
    conflicts.push(`branch ${b}`);
    details.push(`branch ${b}: CONFLICT — ${twoWay ? "both sides have diverged" : "destination has commits not in source"}`);
  }

  let tagCount = 0;
  if (cfg.syncTags) {
    const srcTags = await listRefs(dir, "refs/src/tags");
    const dstTags = await listRefs(dir, "refs/dst/tags");
    tagCount = new Set([...srcTags.keys(), ...(twoWay ? dstTags.keys() : [])]).size;
    for (const [t, s] of srcTags) {
      const d = dstTags.get(t);
      if (d === s) continue;
      if (!d) { toDest.push(`${s}:refs/tags/${t}`); details.push(`tag ${t}: created on destination`); continue; }
      if (allowForce) { toDest.push(`+${s}:refs/tags/${t}`); details.push(`tag ${t}: force-updated destination`); continue; }
      conflicts.push(`tag ${t}`);
      details.push(`tag ${t}: CONFLICT — points to different commits`);
    }
    if (twoWay) {
      for (const [t, d] of dstTags) {
        if (!srcTags.has(t)) { toSource.push(`${d}:refs/tags/${t}`); details.push(`tag ${t}: created on source`); }
      }
    }
  }

  if (toDest.length) await push(dir, dest, toDest);
  if (toSource.length) await push(dir, source, toSource);

  const parts: string[] = [];
  if (!toDest.length && !toSource.length && conflicts.length) parts.push("Nothing pushed");
  else if (!toDest.length && !toSource.length) parts.push(`Up to date (${names.size} branch${names.size === 1 ? "" : "es"}${cfg.syncTags ? `, ${tagCount} tag${tagCount === 1 ? "" : "s"}` : ""})`);
  if (toDest.length) parts.push(`${toDest.length} ref${toDest.length === 1 ? "" : "s"} pushed to destination`);
  if (toSource.length) parts.push(`${toSource.length} ref${toSource.length === 1 ? "" : "s"} pushed to source`);
  if (conflicts.length) parts.push(`${conflicts.length} conflict${conflicts.length === 1 ? "" : "s"}: ${conflicts.slice(0, 3).join(", ")}${conflicts.length > 3 ? "…" : ""}`);

  return { status: conflicts.length ? "conflict" : "success", message: parts.join(" · "), details };
}
