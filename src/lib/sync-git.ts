import { spawn } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import type { FileChange, RefChange, SyncMode } from "./sync-shared";

export interface Remote { url: string; token?: string; readOnly?: boolean }
export interface SyncConfig {
  direction: "one_way" | "two_way";
  branches: string;
  syncTags: boolean;
  forcePush: boolean;
  mode: SyncMode;
  propagateDeletes: boolean;
}
/** Ref maps keyed "heads/<branch>" or "tags/<tag>" as observed after the previous run. */
export interface RefState { src: Record<string, string>; dst: Record<string, string> }
export interface SyncResult {
  status: "success" | "conflict" | "failed";
  message: string;
  details: string[];
  changes: RefChange[];
  filesChanged: number;
  state: RefState | null;
}
export type ProgressFn = (stage: string, percent: number) => void;

const PUSH_CHUNK = 200;
const MAX_FILES_PER_REF = 1000;
const STDERR_KEEP = 64 * 1024;

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

function git(dir: string, args: string[], opts: { token?: string; onPercent?: (p: number) => void } = {}):
  Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise(resolve => {
    const child = spawn("git", args, { cwd: dir, env: gitEnv(opts.token) });
    const out: Buffer[] = [];
    let err = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 15 * 60_000);
    child.stdout.on("data", (c: Buffer) => out.push(c));
    child.stderr.on("data", (c: Buffer) => {
      const text = c.toString();
      err = (err + text).slice(-STDERR_KEEP);
      if (opts.onPercent) {
        for (const m of text.matchAll(/(Receiving objects|Resolving deltas|Writing objects|Compressing objects):\s+(\d+)%/g)) {
          const weight = m[1] === "Receiving objects" || m[1] === "Writing objects" ? 0.8 : 0.2;
          const offset = m[1] === "Resolving deltas" ? 0.8 : 0;
          opts.onPercent(offset + (Number(m[2]) / 100) * weight);
        }
      }
    });
    child.on("error", e => { clearTimeout(timer); resolve({ code: 1, stdout: "", stderr: e.message }); });
    child.on("close", code => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout: Buffer.concat(out).toString(), stderr: err });
    });
  });
}

async function gitOk(dir: string, args: string[], opts?: { token?: string; onPercent?: (p: number) => void }): Promise<string> {
  const r = await git(dir, args, opts);
  if (r.code !== 0) {
    const lines = r.stderr.split(/[\r\n]+/).map(l => l.trim()).filter(l => l && !/^(remote: )?(Counting|Compressing|Receiving|Resolving|Writing|Enumerating|Total)/.test(l));
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
  throw new Error(r.stderr.trim() || "merge-base failed");
}

export function branchMatcher(spec: string): (branch: string) => boolean {
  const patterns = spec.split(",").map(s => s.trim()).filter(Boolean);
  if (!patterns.length) return () => true;
  const regexes = patterns.map(p => new RegExp("^" + p.split("*").map(s => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$"));
  return b => regexes.some(r => r.test(b));
}

function parseNameStatus(out: string): FileChange[] {
  const parts = out.split("\0").filter(p => p !== "");
  const files: FileChange[] = [];
  for (let i = 0; i < parts.length;) {
    const code = parts[i++];
    const status = code[0];
    if (status === "R" || status === "C") { files.push({ status, from: parts[i], path: parts[i + 1] }); i += 2; }
    else { files.push({ status, path: parts[i] }); i += 1; }
  }
  return files;
}

async function filesBetween(dir: string, from: string | null, to: string): Promise<FileChange[]> {
  if (from) return parseNameStatus(await gitOk(dir, ["diff", "--name-status", "-z", "-M", from, to]));
  const out = await gitOk(dir, ["ls-tree", "-r", "-z", "--name-only", to]);
  return out.split("\0").filter(Boolean).map(p => ({ status: "A", path: p }));
}

async function mergeBase(dir: string, a: string, b: string): Promise<string | null> {
  const r = await git(dir, ["merge-base", a, b]);
  return r.code === 0 ? r.stdout.trim() || null : null;
}

async function push(dir: string, remote: Remote, refspecs: string[], onPercent?: (p: number) => void) {
  if (remote.readOnly) throw new Error("Refused to write to a read-only repository");
  for (let i = 0; i < refspecs.length; i += PUSH_CHUNK) {
    const chunk = refspecs.slice(i, i + PUSH_CHUNK);
    await gitOk(dir, ["push", "--progress", remote.url, ...chunk], {
      token: remote.token,
      onPercent: onPercent && (p => onPercent((i + p * chunk.length) / refspecs.length)),
    });
  }
}

interface Op { key: string; side: "src" | "dst"; sha: string | null; force: boolean; change: RefChange }

export async function syncRepositories(
  dir: string, sourceRemote: Remote, dest: Remote, cfg: SyncConfig, previous: RefState | null = null, onProgress: ProgressFn = () => {},
): Promise<SyncResult> {
  const twoWay = cfg.direction === "two_way";
  // One-way syncs must never modify the source: it is only ever fetched from.
  const source: Remote = { ...sourceRemote, readOnly: sourceRemote.readOnly || !twoWay };
  if (source.url.toLowerCase() === dest.url.toLowerCase()) throw new Error("Source and destination are the same repository");

  onProgress("Preparing", 2);
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
  onProgress("Fetching source", 5);
  await gitOk(dir, ["fetch", "--prune", "--no-tags", "--progress", source.url, ...refspecs("src")],
    { token: source.token, onPercent: p => onProgress("Fetching source", 5 + p * 35) });
  onProgress("Fetching destination", 40);
  await gitOk(dir, ["fetch", "--prune", "--no-tags", "--progress", dest.url, ...refspecs("dst")],
    { token: dest.token, onPercent: p => onProgress("Fetching destination", 40 + p * 30) });

  onProgress("Comparing", 70);
  const matches = branchMatcher(cfg.branches);
  const collect = async (side: string) => {
    const map: Record<string, string> = {};
    for (const [b, sha] of await listRefs(dir, `refs/${side}/heads`)) if (matches(b)) map[`heads/${b}`] = sha;
    if (cfg.syncTags) for (const [t, sha] of await listRefs(dir, `refs/${side}/tags`)) map[`tags/${t}`] = sha;
    return map;
  };
  const S = await collect("src");
  const D = await collect("dst");
  const inScope = (k: string) => (k.startsWith("heads/") ? matches(k.slice(6)) : cfg.syncTags);
  const P: RefState | null = previous && {
    src: Object.fromEntries(Object.entries(previous.src).filter(([k]) => inScope(k))),
    dst: Object.fromEntries(Object.entries(previous.dst).filter(([k]) => inScope(k))),
  };

  const ops: Op[] = [];
  const details: string[] = [];
  const conflicts: string[] = [];
  const baseline = cfg.mode === "changes" && !P;
  const label = (k: string) => (k.startsWith("heads/") ? `branch ${k.slice(6)}` : `tag ${k.slice(5)}`);
  const conflict = (k: string, why: string) => { conflicts.push(k); details.push(`${label(k)}: CONFLICT — ${why}`); };
  const op = (k: string, side: "src" | "dst", sha: string | null, from: string | null, action: RefChange["action"]) => {
    const kind = k.startsWith("heads/") ? "branch" : "tag";
    const target = side === "dst" ? "destination" : "source";
    ops.push({ key: k, side, sha, force: action === "forced", change: { ref: k.slice(kind === "branch" ? 6 : 5), kind, target, action, from, to: sha, files: [], filesTruncated: 0 } });
    details.push(`${label(k)}: ${action === "created" ? "created on" : action === "updated" ? "fast-forwarded" : action === "forced" ? "force-updated" : "deleted from"} ${target}`);
  };
  const isBranch = (k: string) => k.startsWith("heads/");

  if (!baseline) {
    const keys = new Set([...Object.keys(S), ...Object.keys(D), ...Object.keys(P?.src ?? {}), ...Object.keys(P?.dst ?? {})]);
    for (const k of [...keys].sort()) {
      const s = S[k], d = D[k], ps = P?.src[k], pd = P?.dst[k];

      if (!twoWay) {
        if (!s) {
          if (cfg.propagateDeletes && ps && d) {
            if (d === ps || cfg.forcePush) op(k, "dst", null, d, "deleted");
            else conflict(k, "deleted in source, but the destination has other commits — kept");
          }
          continue;
        }
        if (cfg.mode === "changes" && ps === s) continue;
        if (s === d) continue;
        if (!d) { op(k, "dst", s, null, "created"); continue; }
        if (isBranch(k) && await isAncestor(dir, d, s)) { op(k, "dst", s, d, "updated"); continue; }
        if (cfg.forcePush) { op(k, "dst", s, d, "forced"); continue; }
        conflict(k, isBranch(k) ? "destination has commits not in source" : "tag points to a different commit");
        continue;
      }

      if (!s && !d) continue;
      if (!s || !d) {
        const wasOnBoth = ps !== undefined && pd !== undefined;
        const present = (s ?? d)!;
        const presentSide: "src" | "dst" = s ? "src" : "dst";
        const missingSide: "src" | "dst" = s ? "dst" : "src";
        const presentBefore = s ? ps : pd;
        if (wasOnBoth && cfg.propagateDeletes) {
          if (present === presentBefore) op(k, presentSide, null, present, "deleted");
          else conflict(k, `deleted on ${missingSide === "src" ? "source" : "destination"} but changed on the other side — kept`);
          continue;
        }
        if (cfg.mode === "changes" && presentBefore === present) continue;
        op(k, missingSide, present, null, "created");
        continue;
      }
      if (s === d) continue;
      if (cfg.mode === "changes" && s === ps && d === pd) continue;
      if (isBranch(k) && await isAncestor(dir, d, s)) { op(k, "dst", s, d, "updated"); continue; }
      if (isBranch(k) && await isAncestor(dir, s, d)) { op(k, "src", d, s, "updated"); continue; }
      conflict(k, isBranch(k) ? "both sides have diverged" : "tag points to different commits on each side");
    }
  }

  onProgress("Listing changed files", 75);
  const dstDefault = D["heads/main"] ?? D["heads/master"] ?? Object.entries(D).find(([k]) => isBranch(k))?.[1] ?? null;
  const srcDefault = S["heads/main"] ?? S["heads/master"] ?? Object.entries(S).find(([k]) => isBranch(k))?.[1] ?? null;
  for (const o of ops) {
    if (o.change.kind !== "branch" || !o.sha) continue;
    let from = o.change.from;
    if (!from) {
      const other = o.side === "dst" ? dstDefault : srcDefault;
      from = other ? await mergeBase(dir, other, o.sha) : null;
    }
    const files = await filesBetween(dir, from, o.sha);
    o.change.files = files.slice(0, MAX_FILES_PER_REF);
    o.change.filesTruncated = Math.max(0, files.length - MAX_FILES_PER_REF);
  }

  const refspec = (o: Op) => (o.sha ? `${o.force ? "+" : ""}${o.sha}:refs/${o.key}` : `:refs/${o.key}`);
  const toDest = ops.filter(o => o.side === "dst");
  const toSource = ops.filter(o => o.side === "src");
  if (toDest.length) {
    onProgress("Pushing to destination", 80);
    await push(dir, dest, toDest.map(refspec), p => onProgress("Pushing to destination", 80 + p * (toSource.length ? 10 : 18)));
  }
  if (toSource.length) {
    onProgress("Pushing to source", 90);
    await push(dir, source, toSource.map(refspec), p => onProgress("Pushing to source", 90 + p * 8));
  }
  onProgress("Finishing", 99);

  // New state reflects both sides after this run; conflicted refs keep their previous values so they are retried.
  const state: RefState = { src: { ...S }, dst: { ...D } };
  for (const o of ops) {
    const m = o.side === "src" ? state.src : state.dst;
    if (o.sha) m[o.key] = o.sha; else delete m[o.key];
  }
  for (const k of conflicts) {
    for (const [m, prev] of [[state.src, P?.src[k]], [state.dst, P?.dst[k]]] as const) {
      if (prev === undefined) delete m[k]; else m[k] = prev;
    }
  }

  const changes = ops.map(o => o.change);
  const filesChanged = changes.reduce((n, c) => n + c.files.length + c.filesTruncated, 0);
  const branchCount = new Set([...Object.keys(S), ...(twoWay ? Object.keys(D) : [])].filter(isBranch)).size;
  const tagCount = new Set([...Object.keys(S), ...(twoWay ? Object.keys(D) : [])].filter(k => !isBranch(k))).size;
  const parts: string[] = [];
  if (baseline) parts.push(`Starting point recorded (${branchCount} branch${branchCount === 1 ? "" : "es"}${cfg.syncTags ? `, ${tagCount} tag${tagCount === 1 ? "" : "s"}` : ""}) — changes from now on will be synced`);
  else if (!ops.length && conflicts.length) parts.push("Nothing pushed");
  else if (!ops.length) parts.push(`Up to date (${branchCount} branch${branchCount === 1 ? "" : "es"}${cfg.syncTags ? `, ${tagCount} tag${tagCount === 1 ? "" : "s"}` : ""})`);
  const count = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const pushed = ops.filter(o => o.sha);
  const deleted = ops.filter(o => !o.sha);
  if (pushed.length) parts.push(`${count(pushed.length, "ref")} updated, ${count(filesChanged, "file")} changed`);
  if (deleted.length) parts.push(`${count(deleted.length, "ref")} deleted`);
  if (conflicts.length) parts.push(`${count(conflicts.length, "conflict")}: ${conflicts.slice(0, 3).map(label).join(", ")}${conflicts.length > 3 ? "…" : ""}`);

  return { status: conflicts.length ? "conflict" : "success", message: parts.join(" · "), details, changes, filesChanged, state };
}
