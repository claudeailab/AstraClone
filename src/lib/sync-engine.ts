import os from "node:os";
import path from "node:path";
import { rm } from "node:fs/promises";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { db } from "./db";
import { github_connections, repositories, sync_runs, syncs } from "./db/schema";
import { decrypt } from "./encryption";
import { repoUrl } from "./github";
import { syncRepositories, type RefState, type SyncResult } from "./sync-git";
import type { SyncOverview, SyncProgress } from "./sync-shared";

const WORK_ROOT = path.join(os.tmpdir(), "astraclone-sync");
const KEEP_RUNS = 50;
const TICK_MS = 60_000;
const active = new Set<number>();
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

export function isSyncRunning(id: number) {
  return active.has(id);
}

export async function runSync(id: number, triggeredBy: "schedule" | "manual"): Promise<boolean> {
  if (active.has(id)) return false;
  active.add(id);
  const startedAt = new Date();
  let runId: number | null = null;
  let result: SyncResult;

  try {
    const [cfg] = await db.select().from(syncs).where(eq(syncs.id, id)).limit(1);
    if (!cfg) return false;
    await db.update(syncs).set({ lastStatus: "running", lastRunAt: startedAt }).where(eq(syncs.id, id));
    const [ins] = await db.insert(sync_runs).values({ syncId: id, triggeredBy, status: "running", startedAt });
    runId = ins.insertId;

    const [source, dest] = await Promise.all([loadRemote(cfg.sourceRepoId), loadRemote(cfg.destRepoId)]);
    if (sameRepository(source.repo, dest.repo)) throw new Error("Source and destination are the same GitHub repository — sync refused");
    let previous: RefState | null = null;
    try { previous = cfg.refState ? JSON.parse(cfg.refState) as RefState : null; } catch { previous = null; }
    result = await syncRepositories(workdir(id), source.remote, dest.remote, {
      direction: cfg.direction === "two_way" ? "two_way" : "one_way",
      branches: cfg.branches,
      syncTags: cfg.syncTags,
      forcePush: cfg.forcePush,
      mode: cfg.mode === "changes" ? "changes" : "full",
      propagateDeletes: cfg.propagateDeletes,
    }, previous, (stage, percent) => progress.set(id, { stage, percent: Math.min(100, Math.round(percent)) }));
  } catch (err) {
    result = { status: "failed", message: err instanceof Error ? err.message : String(err), details: [], changes: [], filesChanged: 0, state: null };
  }

  try {
    await db.update(syncs).set({
      lastStatus: result.status,
      lastMessage: result.message,
      ...(result.state ? { refState: JSON.stringify(result.state) } : {}),
    }).where(eq(syncs.id, id));
    if (runId) {
      await db.update(sync_runs)
        .set({
          status: result.status, message: result.message, details: result.details.join("\n"),
          changes: result.changes.length ? JSON.stringify(result.changes) : null, filesChanged: result.filesChanged, finishedAt: new Date(),
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
    db.select({ id: repositories.id, owner: repositories.owner, name: repositories.name }).from(repositories),
  ]);
  const repoName = new Map(repos.map(r => [r.id, `${r.owner}/${r.name}`]));
  const runs = await Promise.all(rows.map(s =>
    db.select({
      id: sync_runs.id, status: sync_runs.status, triggeredBy: sync_runs.triggeredBy,
      message: sync_runs.message, filesChanged: sync_runs.filesChanged, startedAt: sync_runs.startedAt, finishedAt: sync_runs.finishedAt,
    }).from(sync_runs).where(eq(sync_runs.syncId, s.id)).orderBy(desc(sync_runs.id)).limit(RECENT_RUNS)
  ));
  return rows.map((s, i) => ({
    id: s.id,
    sourceRepoId: s.sourceRepoId,
    destRepoId: s.destRepoId,
    source: repoName.get(s.sourceRepoId) ?? "(deleted)",
    destination: repoName.get(s.destRepoId) ?? "(deleted)",
    direction: s.direction === "two_way" ? "two_way" : "one_way",
    branches: s.branches,
    syncTags: s.syncTags,
    forcePush: s.forcePush,
    mode: s.mode === "changes" ? "changes" : "full",
    propagateDeletes: s.propagateDeletes,
    intervalMinutes: s.intervalMinutes,
    enabled: s.enabled,
    lastStatus: active.has(s.id) ? "running" : s.lastStatus,
    lastMessage: s.lastMessage,
    lastRunAt: s.lastRunAt?.toISOString() ?? null,
    running: active.has(s.id),
    progress: progress.get(s.id) ?? null,
    recentRuns: runs[i].map(r => ({ ...r, startedAt: r.startedAt.toISOString(), finishedAt: r.finishedAt?.toISOString() ?? null })),
  }));
}
