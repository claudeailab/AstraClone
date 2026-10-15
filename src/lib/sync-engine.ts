import os from "node:os";
import path from "node:path";
import { rm } from "node:fs/promises";
import { and, desc, eq, inArray, lt, notInArray, sql } from "drizzle-orm";
import { db } from "./db";
import { github_connections, repositories, sync_runs, syncs } from "./db/schema";
import { decrypt } from "./encryption";
import { inspectRepo, parseRepoRef, repoUrl } from "./github";
import { syncRepositories, verifyRepositories, type RefState, type SyncResult } from "./sync-git";
import type { SyncOverview, SyncProgress, Verification } from "./sync-shared";

const WORK_ROOT = path.join(os.tmpdir(), "astraclone-sync");
const KEEP_RUNS = 50;
const TICK_MS = 60_000;
const active = new Map<number, "sync" | "verify">();
const progress = new Map<number, SyncProgress>();
let ticking = false;

declare global {
  var __astracloneSyncTimer: NodeJS.Timeout | undefined;
}

function workdir(syncId: number) {
  return path.join(WORK_ROOT, String(syncId));
}

export function sameRepository(
  a: { owner: string; name: string; githubId: number | null },
  b: { owner: string; name: string; githubId: number | null },
) {
  if (a.githubId && b.githubId) return a.githubId === b.githubId;
  return `${a.owner}/${a.name}`.toLowerCase() === `${b.owner}/${b.name}`.toLowerCase();
}

async function loadRemote(repoId: number) {
  const [row] = await db
    .select({ owner: repositories.owner, name: repositories.name, githubId: repositories.githubId, token: github_connections.token })
    .from(repositories)
    .innerJoin(github_connections, eq(repositories.connectionId, github_connections.id))
    .where(eq(repositories.id, repoId))
    .limit(1);
  if (!row) throw new Error(`Repository #${repoId} no longer exists`);
  return { repo: row, remote: { url: repoUrl(row.owner, row.name), token: decrypt(row.token) } };
}

export function isSyncBusy(id: number) {
  return active.has(id);
}

type SyncRow = typeof syncs.$inferSelect;

function scopeOf(cfg: SyncRow) {
  return { direction: cfg.direction === "two_way" ? "two_way" as const : "one_way" as const, branches: cfg.branches, syncTags: cfg.syncTags };
}

async function loadPair(cfg: SyncRow) {
  const [source, dest] = await Promise.all([loadRemote(cfg.sourceRepoId), loadRemote(cfg.destRepoId)]);
  if (sameRepository(source.repo, dest.repo)) throw new Error("Source and destination are the same GitHub repository — sync refused");
  return { source: source.remote, dest: dest.remote };
}

function failedVerification(err: unknown): Verification {
  return { status: "error", checkedAt: new Date().toISOString(), branches: 0, identicalBranches: 0, tags: 0, identicalTags: 0, differences: [], error: err instanceof Error ? err.message : String(err) };
}

/** Compares both repositories without changing either; stores the result on the sync. */
export async function verifySync(id: number): Promise<boolean> {
  if (active.has(id)) return false;
  active.set(id, "verify");
  try {
    const [cfg] = await db.select().from(syncs).where(eq(syncs.id, id)).limit(1);
    if (!cfg) return false;
    let verification: Verification;
    try {
      const { source, dest } = await loadPair(cfg);
      verification = await verifyRepositories(workdir(id), source, dest, scopeOf(cfg), (stage, percent) => progress.set(id, { stage, percent: Math.round(percent) }));
    } catch (err) {
      verification = failedVerification(err);
    }
    await db.update(syncs).set({ verification: JSON.stringify(verification) }).where(eq(syncs.id, id));
    return true;
  } finally {
    active.delete(id);
    progress.delete(id);
  }
}

export async function runSync(id: number, triggeredBy: "schedule" | "manual"): Promise<boolean> {
  if (active.has(id)) return false;
  active.set(id, "sync");
  const startedAt = new Date();
  let runId: number | null = null;
  let result: SyncResult;
  let verification: Verification | null = null;
  const report = (from: number, span: number) => (stage: string, percent: number) =>
    progress.set(id, { stage, percent: Math.min(100, Math.round(from + (percent / 100) * span)) });

  try {
    const [cfg] = await db.select().from(syncs).where(eq(syncs.id, id)).limit(1);
    if (!cfg) return false;
    await db.update(syncs).set({ lastStatus: "running", lastRunAt: startedAt }).where(eq(syncs.id, id));
    const [ins] = await db.insert(sync_runs).values({ syncId: id, triggeredBy, status: "running", startedAt });
    runId = ins.insertId;

    const { source, dest } = await loadPair(cfg);
    let previous: RefState | null = null;
    try { previous = cfg.refState ? JSON.parse(cfg.refState) as RefState : null; } catch { previous = null; }
    result = await syncRepositories(workdir(id), source, dest, {
      ...scopeOf(cfg),
      forcePush: cfg.forcePush,
      propagateDeletes: cfg.propagateDeletes,
    }, previous, report(0, 80));
    try {
      verification = await verifyRepositories(workdir(id), source, dest, scopeOf(cfg), report(80, 20));
    } catch (err) {
      verification = failedVerification(err);
    }
  } catch (err) {
    result = { status: "failed", message: err instanceof Error ? err.message : String(err), details: [], changes: [], filesChanged: 0, state: null };
  }

  try {
    await db.update(syncs).set({
      lastStatus: result.status,
      lastMessage: result.message,
      ...(result.state ? { refState: JSON.stringify(result.state) } : {}),
      ...(verification ? { verification: JSON.stringify(verification) } : {}),
    }).where(eq(syncs.id, id));
    if (runId) {
      await db.update(sync_runs)
        .set({
          status: result.status, message: result.message, details: result.details.join("\n"),
          changes: result.changes.length ? JSON.stringify(result.changes) : null, filesChanged: result.filesChanged,
          verification: verification ? JSON.stringify(verification) : null, finishedAt: new Date(),
        })
        .where(eq(sync_runs.id, runId));
      const [cutoff] = await db.select({ id: sync_runs.id }).from(sync_runs)
        .where(eq(sync_runs.syncId, id)).orderBy(desc(sync_runs.id)).limit(1).offset(KEEP_RUNS - 1);
      if (cutoff) await db.delete(sync_runs).where(and(eq(sync_runs.syncId, id), lt(sync_runs.id, cutoff.id)));
    }
    if (result.status === "failed") console.error(`[Sync] #${id} failed: ${result.message}`);
  } finally {
    active.delete(id);
    progress.delete(id);
  }
  return true;
}

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const rows = await db.select({ id: syncs.id, intervalMinutes: syncs.intervalMinutes, lastRunAt: syncs.lastRunAt })
      .from(syncs).where(eq(syncs.enabled, true));
    const now = Date.now();
    for (const r of rows) {
      if (!r.lastRunAt || now - r.lastRunAt.getTime() >= r.intervalMinutes * 60_000) await runSync(r.id, "schedule");
    }
  } catch (err) {
    console.error("[Sync] Scheduler error:", err);
  } finally {
    ticking = false;
  }
}

export async function startSyncScheduler() {
  if (globalThis.__astracloneSyncTimer) return;
  const interrupted = { status: "failed", message: "Interrupted by restart" };
  await db.update(syncs).set({ lastStatus: interrupted.status, lastMessage: interrupted.message }).where(eq(syncs.lastStatus, "running"));
  await db.update(sync_runs).set({ ...interrupted, finishedAt: new Date() }).where(eq(sync_runs.status, "running"));
  globalThis.__astracloneSyncTimer = setInterval(tick, TICK_MS);
  setTimeout(tick, 15_000);
}

export async function removeSyncWorkdirs(ids: number[]) {
  await Promise.all(ids.map(id => rm(workdir(id), { recursive: true, force: true })));
}

const RECENT_RUNS = 10;

export async function describeRoute(sourceRepoId: number, destRepoId: number, direction: string) {
  const rows = await db.select({ id: repositories.id, owner: repositories.owner, name: repositories.name })
    .from(repositories).where(inArray(repositories.id, [sourceRepoId, destRepoId]));
  const label = (id: number) => { const r = rows.find(x => x.id === id); return r ? `${r.owner}/${r.name}` : `#${id}`; };
  return `${label(sourceRepoId)} ${direction === "two_way" ? "↔" : "→"} ${label(destRepoId)}`;
}

export async function listSyncOverview(): Promise<SyncOverview[]> {
  const [rows, repos] = await Promise.all([
    db.select().from(syncs).orderBy(syncs.id),
    db.select({ id: repositories.id, connectionId: repositories.connectionId, owner: repositories.owner, name: repositories.name }).from(repositories),
  ]);
  const repoName = new Map(repos.map(r => [r.id, `${r.owner}/${r.name}`]));
  const repoConn = new Map(repos.map(r => [r.id, r.connectionId]));
  const runs = await Promise.all(rows.map(s =>
    db.select({
      id: sync_runs.id, status: sync_runs.status, triggeredBy: sync_runs.triggeredBy,
      message: sync_runs.message, filesChanged: sync_runs.filesChanged, startedAt: sync_runs.startedAt, finishedAt: sync_runs.finishedAt,
    }).from(sync_runs).where(eq(sync_runs.syncId, s.id)).orderBy(desc(sync_runs.id)).limit(RECENT_RUNS)
  ));
  return rows.map((s, i) => ({
    id: s.id,
    sourceConnectionId: repoConn.get(s.sourceRepoId) ?? 0,
    destConnectionId: repoConn.get(s.destRepoId) ?? 0,
    source: repoName.get(s.sourceRepoId) ?? "(deleted)",
    destination: repoName.get(s.destRepoId) ?? "(deleted)",
    direction: s.direction === "two_way" ? "two_way" : "one_way",
    branches: s.branches,
    syncTags: s.syncTags,
    forcePush: s.forcePush,
    propagateDeletes: s.propagateDeletes,
    intervalMinutes: s.intervalMinutes,
    enabled: s.enabled,
    lastStatus: active.get(s.id) === "sync" ? "running" : s.lastStatus,
    lastMessage: s.lastMessage,
    lastRunAt: s.lastRunAt?.toISOString() ?? null,
    running: active.get(s.id) === "sync",
    verifying: active.get(s.id) === "verify",
    progress: progress.get(s.id) ?? null,
    verification: parseVerification(s.verification),
    recentRuns: runs[i].map(r => ({ ...r, startedAt: r.startedAt.toISOString(), finishedAt: r.finishedAt?.toISOString() ?? null })),
  }));
}

/** Verifies access with the account's token and returns the internal repository record, creating or refreshing it. */
export async function resolveRepository(connectionId: number, fullName: string):
  Promise<{ id: number; owner: string; name: string; githubId: number | null; canPush: boolean } | { error: string }> {
  const ref = parseRepoRef(fullName);
  if (!ref) return { error: `Invalid repository "${fullName}"` };
  const [conn] = await db.select({ token: github_connections.token }).from(github_connections).where(eq(github_connections.id, connectionId)).limit(1);
  if (!conn) return { error: "GitHub account not found" };
  let token: string;
  try { token = decrypt(conn.token); } catch { return { error: "Account token cannot be decrypted — re-enter it" }; }
  const info = await inspectRepo(token, ref.owner, ref.name);
  if (!info.ok) return { error: info.error };
  const values = { connectionId, owner: ref.owner, name: ref.name, githubId: info.githubId, isPrivate: info.isPrivate, canPush: info.canPush, defaultBranch: info.defaultBranch };
  const [existing] = await db.select({ id: repositories.id }).from(repositories).where(and(
    eq(repositories.connectionId, connectionId),
    sql`lower(${repositories.owner}) = ${ref.owner.toLowerCase()}`,
    sql`lower(${repositories.name}) = ${ref.name.toLowerCase()}`,
  )).limit(1);
  let id: number;
  if (existing) {
    await db.update(repositories).set(values).where(eq(repositories.id, existing.id));
    id = existing.id;
  } else {
    const [ins] = await db.insert(repositories).values(values);
    id = ins.insertId;
  }
  return { id, owner: ref.owner, name: ref.name, githubId: info.githubId, canPush: info.canPush };
}

/** Repository records exist only for synchronizations; remove any no longer referenced. */
export async function pruneUnusedRepositories() {
  const used = await db.select({ src: syncs.sourceRepoId, dst: syncs.destRepoId }).from(syncs);
  const ids = [...new Set(used.flatMap(u => [u.src, u.dst]))];
  await db.delete(repositories).where(ids.length ? notInArray(repositories.id, ids) : undefined);
}

export function parseVerification(raw: string | null): Verification | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as Verification; } catch { return null; }
}
