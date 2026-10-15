// Browser-safe — no server imports. Shared by admin and user sync views.

export const SYNC_DIRECTIONS = [
  { value: "one_way", label: "One-way (source → destination)" },
  { value: "two_way", label: "Two-way (fast-forward both ways)" },
] as const;
export type SyncDirection = typeof SYNC_DIRECTIONS[number]["value"];

export const SYNC_INTERVALS = [5, 15, 30, 60, 180, 360, 720, 1440];

export function intervalLabel(minutes: number) {
  if (minutes % 1440 === 0) return minutes === 1440 ? "Every day" : `Every ${minutes / 1440} days`;
  if (minutes % 60 === 0) return minutes === 60 ? "Every hour" : `Every ${minutes / 60} hours`;
  return `Every ${minutes} minutes`;
}

export type SyncStatus = "pending" | "running" | "success" | "conflict" | "failed";

export const SYNC_STATUS: Record<SyncStatus, { label: string; className: string; dot: string }> = {
  pending:  { label: "Pending",   className: "border-transparent bg-secondary text-secondary-foreground", dot: "bg-muted-foreground/40" },
  running:  { label: "Running",   className: "border-transparent bg-primary/15 text-primary", dot: "bg-primary" },
  success:  { label: "In sync",   className: "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500" },
  conflict: { label: "Conflict",  className: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400", dot: "bg-amber-500" },
  failed:   { label: "Failed",    className: "border-transparent bg-destructive/15 text-destructive", dot: "bg-destructive" },
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
  progress: SyncProgress | null;
  verifying: boolean;
  verification: Verification | null;
  recentRuns: SyncRunSummary[];
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

export const VERIFY_STATUS: Record<Verification["status"], { label: string; className: string }> = {
  identical: { label: "Exact replica", className: "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  files_identical: { label: "Files identical", className: "border-transparent bg-primary/15 text-primary" },
  different: { label: "Not identical", className: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  error: { label: "Verification failed", className: "border-transparent bg-destructive/15 text-destructive" },
};
