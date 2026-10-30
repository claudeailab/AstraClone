// Browser-safe — no server imports. Shared by admin and user sync views.

export type SyncDirection = "one_way" | "two_way";

export const SYNC_INTERVALS = [5, 15, 30, 60, 180, 360, 720, 1440];

export function intervalLabel(minutes: number) {
  if (minutes % 1440 === 0) return minutes === 1440 ? "Every day" : `Every ${minutes / 1440} days`;
  if (minutes % 60 === 0) return minutes === 60 ? "Every hour" : `Every ${minutes / 60} hours`;
  return `Every ${minutes} minutes`;
}

export type SyncStatus = "pending" | "running" | "success" | "conflict" | "failed";

export const SYNC_STATUS: Record<SyncStatus, { label: string; dot: string }> = {
  pending:  { label: "Pending",  dot: "bg-muted-foreground/40" },
  running:  { label: "Running",  dot: "bg-primary" },
  success:  { label: "In sync",  dot: "bg-emerald-500" },
  conflict: { label: "Conflict", dot: "bg-amber-500" },
  failed:   { label: "Failed",   dot: "bg-destructive" },
};

export function syncStatus(s: string) {
  return SYNC_STATUS[(s in SYNC_STATUS ? s : "pending") as SyncStatus];
}

export function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const abs = Math.abs(diff);
  const units: [number, string][] = [[86_400_000, "d"], [3_600_000, "h"], [60_000, "m"]];
  for (const [ms, u] of units) {
    if (abs >= ms) return diff >= 0 ? `${Math.floor(abs / ms)}${u} ago` : `in ${Math.ceil(abs / ms)}${u}`;
  }
  return diff >= 0 ? "just now" : "in <1m";
}

export interface SyncRunSummary { id: number; status: string; triggeredBy: string; message: string | null; filesChanged: number; startedAt: string; finishedAt: string | null }

export interface SyncOverview {
  id: number;
  sourceConnectionId: number;
  destConnectionId: number;
  source: string;
  destination: string;
  direction: SyncDirection;
  branches: string;
  syncTags: boolean;
  forcePush: boolean;
  propagateDeletes: boolean;
  intervalMinutes: number;
  enabled: boolean;
  lastStatus: string;
  lastMessage: string | null;
  lastRunAt: string | null;
  running: boolean;
  /** What started the current run (only while `running`). */
  trigger: "schedule" | "manual" | null;
  progress: SyncProgress | null;
  verifying: boolean;
  verification: Verification | null;
}

export function routeLabel(s: Pick<SyncOverview, "source" | "destination" | "direction">) {
  return `${s.source} ${s.direction === "two_way" ? "↔" : "→"} ${s.destination}`;
}

export function nextRunAt(s: Pick<SyncOverview, "enabled" | "lastRunAt" | "intervalMinutes">): string | null {
  if (!s.enabled) return null;
  if (!s.lastRunAt) return new Date().toISOString();
  return new Date(new Date(s.lastRunAt).getTime() + s.intervalMinutes * 60_000).toISOString();
}


export interface FileChange { status: string; path: string; from?: string }
export interface RefChange {
  ref: string;
  kind: "branch" | "tag";
  target: "destination" | "source";
  action: "created" | "updated" | "forced" | "deleted";
  from: string | null;
  to: string | null;
  files: FileChange[];
  filesTruncated: number;
}
export interface SyncProgress { stage: string; percent: number }

export const FILE_STATUS: Record<string, { label: string; className: string }> = {
  A: { label: "Added", className: "text-emerald-700 dark:text-emerald-400" },
  M: { label: "Modified", className: "text-primary" },
  D: { label: "Deleted", className: "text-destructive" },
  R: { label: "Renamed", className: "text-amber-700 dark:text-amber-400" },
  C: { label: "Copied", className: "text-amber-700 dark:text-amber-400" },
  T: { label: "Type changed", className: "text-muted-foreground" },
};

export interface RefDifference {
  ref: string;
  kind: "branch" | "tag";
  source: string | null;
  destination: string | null;
  /** Commit ids differ but the file trees are byte-identical. */
  sameFiles: boolean;
}

export interface Verification {
  status: "identical" | "files_identical" | "different" | "error";
  checkedAt: string;
  branches: number;
  identicalBranches: number;
  tags: number;
  identicalTags: number;
  differences: RefDifference[];
  error?: string;
}

export const VERIFY_STATUS: Record<Verification["status"], { label: string; dot: string; text: string }> = {
  identical: { label: "Exact replica", dot: "bg-emerald-500", text: "text-foreground" },
  files_identical: { label: "Files identical", dot: "bg-emerald-500", text: "text-foreground" },
  different: { label: "Not identical", dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-400" },
  error: { label: "Verification failed", dot: "bg-destructive", text: "text-destructive" },
};

/**
 * How often sync lists refresh: fast while something runs or a scheduled run is due within a minute
 * (the scheduler checks every minute, so short scheduled runs would otherwise start and finish unseen).
 */
export function pollInterval(list: Pick<SyncOverview, "running" | "verifying" | "enabled" | "lastRunAt" | "intervalMinutes">[]): number {
  if (list.some(s => s.running || s.verifying)) return 2_000;
  const now = Date.now();
  const dueSoon = list.some(s => {
    const next = nextRunAt(s);
    if (!next) return false;
    const inMs = new Date(next).getTime() - now;
    return inMs < 60_000 && inMs > -5 * 60_000;
  });
  return dueSoon ? 2_000 : 15_000;
}
