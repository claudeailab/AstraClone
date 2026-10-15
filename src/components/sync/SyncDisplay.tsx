"use client";

import { ArrowLeftRight, ArrowRight, ChevronRight, Clock, FileText, GitBranch, Loader2, PauseCircle, ShieldAlert, ShieldCheck, ShieldQuestion, Tag, Trash2, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FILE_STATUS, VERIFY_STATUS, intervalLabel, nextRunAt, relativeTime, syncStatus, type RefChange, type SyncOverview, type SyncProgress, type SyncRunSummary, type Verification } from "@/lib/sync-shared";

export function SyncStatusBadge({ status }: { status: string }) {
  const s = syncStatus(status);
  return (
    <Badge className={cn("gap-1 whitespace-nowrap", s.className)}>
      {status === "running" && <Loader2 className="h-3 w-3 animate-spin" />}
      {s.label}
    </Badge>
  );
}

export function SyncRoute({ sync }: { sync: Pick<SyncOverview, "source" | "destination" | "direction"> }) {
  const Icon = sync.direction === "two_way" ? ArrowLeftRight : ArrowRight;
  return (
    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-mono md:flex-nowrap" title={`${sync.source} ${sync.direction === "two_way" ? "↔" : "→"} ${sync.destination}`}>
      <span className="min-w-0 break-all md:truncate">{sync.source}</span>
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-label={sync.direction === "two_way" ? "two-way" : "one-way"} />
      <span className="min-w-0 break-all md:truncate">{sync.destination}</span>
    </div>
  );
}

export function RunHistoryDots({ runs }: { runs: SyncRunSummary[] }) {
  if (!runs.length) return null;
  return (
    <div className="flex items-center gap-1" aria-label="Recent runs">
      {[...runs].reverse().map(r => (
        <span
          key={r.id}
          title={`${syncStatus(r.status).label} · ${new Date(r.startedAt).toLocaleString()}${r.message ? ` · ${r.message}` : ""}`}
          className={cn("h-2 w-2 rounded-full", syncStatus(r.status).dot)}
        />
      ))}
    </div>
  );
}

function duration(r: SyncRunSummary) {
  if (!r.finishedAt) return null;
  const s = Math.max(0, Math.round((new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()) / 1000));
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

export interface RunDetail extends SyncRunSummary { details: string | null; changes: RefChange[]; verification: Verification | null }

const ACTION_LABEL: Record<RefChange["action"], string> = { created: "created", updated: "updated", forced: "force-updated", deleted: "deleted" };

function short(sha: string | null) {
  return sha ? sha.slice(0, 7) : "";
}

function RefChangeItem({ c }: { c: RefChange }) {
  const Icon = c.action === "deleted" ? Trash2 : c.kind === "tag" ? Tag : GitBranch;
  const total = c.files.length + c.filesTruncated;
  const head = (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm min-w-0">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="font-mono break-all">{c.ref}</span>
      <span className="text-muted-foreground">{ACTION_LABEL[c.action]} on {c.target}</span>
      {(c.from || c.to) && <span className="font-mono text-xs text-muted-foreground">{short(c.from)}{c.from && c.to ? " → " : ""}{short(c.to)}</span>}
      {c.kind === "branch" && c.action !== "deleted" && <span className="text-xs text-muted-foreground">· {total} file{total === 1 ? "" : "s"}</span>}
    </span>
  );
  if (!c.files.length) return <li className="py-1.5">{head}</li>;
  return (
    <li className="py-1.5">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start gap-1 [&::-webkit-details-marker]:hidden">
          <ChevronRight className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground transition-transform group-open:rotate-90" />
          {head}
        </summary>
        <ul className="mt-1.5 ml-5 flex flex-col gap-0.5 max-h-72 overflow-y-auto">
          {c.files.map((f, i) => {
            const st = FILE_STATUS[f.status] ?? FILE_STATUS.M;
            return (
              <li key={i} className="flex items-start gap-2 text-xs font-mono">
                <span className={cn("w-4 shrink-0 font-bold", st.className)} title={st.label}>{f.status}</span>
                <span className="break-all">{f.from ? `${f.from} → ${f.path}` : f.path}</span>
              </li>
            );
          })}
          {c.filesTruncated > 0 && <li className="text-xs text-muted-foreground">…and {c.filesTruncated} more</li>}
        </ul>
      </details>
    </li>
  );
}

export function RunHistoryList({ runs }: { runs: RunDetail[] }) {
  if (!runs.length) return <p className="text-sm text-muted-foreground py-6 text-center">No runs yet.</p>;
  return (
    <ul className="divide-y divide-border">
      {runs.map(r => {
        const conflicts = (r.details ?? "").split("\n").filter(l => l.includes("CONFLICT"));
        return (
          <li key={r.id} className="py-3 flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <SyncStatusBadge status={r.status} />
              <span className="text-xs text-muted-foreground">
                {new Date(r.startedAt).toLocaleString()} · {r.triggeredBy}{duration(r) ? ` · ${duration(r)}` : ""}
              </span>
              {r.filesChanged > 0 && <span className="flex items-center gap-1 text-xs text-muted-foreground"><FileText className="h-3 w-3" />{r.filesChanged} file{r.filesChanged === 1 ? "" : "s"}</span>}
            </div>
            {r.message && <p className="text-sm break-words">{r.message}</p>}
            {r.verification && <VerificationSummary verification={r.verification} />}
            {r.changes.length > 0 && <ul className="flex flex-col">{r.changes.map((c, i) => <RefChangeItem key={i} c={c} />)}</ul>}
            {conflicts.length > 0 && (
              <ul className="flex flex-col gap-0.5">
                {conflicts.map((l, i) => <li key={i} className="text-xs text-amber-700 dark:text-amber-400 break-words">{l}</li>)}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function SyncProgressBar({ progress }: { progress: SyncProgress | null }) {
  const pct = progress?.percent ?? 0;
  return (
    <div className="flex flex-col gap-1.5" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 text-primary"><Loader2 className="h-3 w-3 animate-spin" />{progress?.stage ?? "Starting"}</span>
        <span className="tabular-nums text-muted-foreground">{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function SyncFacts({ sync }: { sync: Pick<SyncOverview, "direction" | "branches" | "syncTags" | "forcePush" | "intervalMinutes" | "propagateDeletes"> }) {
  const item = "inline-flex items-center gap-1 whitespace-nowrap";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span className={item}>
        {sync.direction === "two_way" ? <ArrowLeftRight className="h-3 w-3" /> : <ArrowRight className="h-3 w-3" />}
        {sync.direction === "two_way" ? "Two-way" : "One-way"}
      </span>
      <span className={item}><Clock className="h-3 w-3" />{intervalLabel(sync.intervalMinutes)}</span>
      <span className={`${item} font-mono`}><GitBranch className="h-3 w-3" />{sync.branches || "all branches"}</span>
      {sync.syncTags && <span className={item}><Tag className="h-3 w-3" />Tags</span>}
      {sync.propagateDeletes && <span className={item}><Trash2 className="h-3 w-3" />Mirrors deletions</span>}
      {sync.forcePush && <span className={item}><Zap className="h-3 w-3" />Overwrites destination</span>}
    </div>
  );
}

/**
 * One synchronization as a compact row of three full-width lines — route · badges / facts / last result + timing · recent runs —
 * with actions in their own column.
 */
export function SyncRow({ sync, actions }: { sync: SyncOverview; actions: React.ReactNode }) {
  const line = "flex flex-wrap items-center justify-between gap-x-6 gap-y-1";
  return (
    <div className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className={line}>
          <SyncRoute sync={sync} />
          <SyncHealth sync={sync} />
        </div>
        <SyncFacts sync={sync} />
        {sync.running || sync.verifying
          ? <SyncProgressBar progress={sync.progress} />
          : (
            <div className={line}>
              <p className="min-w-0 text-sm md:truncate" title={sync.lastMessage ?? undefined}>
                {sync.lastMessage ?? "Not run yet"}
                <span className="text-xs text-muted-foreground">
                  {" · "}Last run {relativeTime(sync.lastRunAt)}{sync.enabled ? ` · next ${relativeTime(nextRunAt(sync))}` : ""}
                </span>
              </p>
              <RunHistoryDots runs={sync.recentRuns} />
            </div>
          )}
      </div>
      <div className="flex shrink-0 items-center gap-1">{actions}</div>
    </div>
  );
}

export function VerificationBadge({ verification, verifying }: { verification: Verification | null; verifying?: boolean }) {
  if (verifying) return <Badge className="gap-1 border-transparent bg-primary/15 text-primary"><Loader2 className="h-3 w-3 animate-spin" />Verifying</Badge>;
  if (!verification) return <Badge variant="outline" className="gap-1 text-muted-foreground"><ShieldQuestion className="h-3 w-3" />Not verified</Badge>;
  const v = VERIFY_STATUS[verification.status];
  const Icon = verification.status === "identical" || verification.status === "files_identical" ? ShieldCheck : ShieldAlert;
  return (
    <Badge className={cn("gap-1 whitespace-nowrap", v.className)} title={`Checked ${relativeTime(verification.checkedAt)}`}>
      <Icon className="h-3 w-3" />{v.label}
    </Badge>
  );
}

function VerificationSummary({ verification }: { verification: Verification }) {
  if (verification.status === "error") return <p className="text-xs text-destructive break-words">Verification failed: {verification.error}</p>;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <VerificationBadge verification={verification} />
      <span>{verification.identicalBranches}/{verification.branches} branches identical{verification.tags ? ` · ${verification.identicalTags}/${verification.tags} tags identical` : ""}</span>
    </p>
  );
}

function describeDifference(d: Verification["differences"][number]) {
  if (!d.destination) return "Missing in destination";
  if (!d.source) return "Only in destination";
  return d.sameFiles ? "Same files, different history" : "Different files";
}

/** Latest proof that the destination matches the source, with every mismatching branch/tag listed. */
export function VerificationPanel({ verification, verifying }: { verification: Verification | null; verifying?: boolean }) {
  if (verifying) return <div className="flex items-center gap-2 rounded-lg border p-3 text-sm text-primary"><Loader2 className="h-4 w-4 animate-spin" />Verifying both repositories…</div>;
  if (!verification) return <p className="rounded-lg border p-3 text-sm text-muted-foreground">Not verified yet — runs automatically after every sync.</p>;
  const explanation = {
    identical: "Every branch and tag points to the same commit in both repositories. Commit ids are hashes of the complete contents, so all files are byte-for-byte identical.",
    files_identical: "All files are byte-for-byte identical, but some commits differ (for example, different history or commit metadata).",
    different: "Some branches or tags do not match. Details below.",
    error: verification.error ?? "Verification could not be completed.",
  }[verification.status];
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <VerificationBadge verification={verification} />
        <span className="text-xs text-muted-foreground">checked {relativeTime(verification.checkedAt)}</span>
      </div>
      {verification.status !== "error" && (
        <p className="text-sm">
          {verification.identicalBranches}/{verification.branches} branches identical
          {verification.tags ? ` · ${verification.identicalTags}/${verification.tags} tags identical` : ""}
        </p>
      )}
      <p className="text-xs text-muted-foreground">{explanation}</p>
      {verification.differences.length > 0 && (
        <ul className="flex flex-col gap-1 max-h-48 overflow-y-auto">
          {verification.differences.map(d => (
            <li key={`${d.kind}:${d.ref}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
              {d.kind === "tag" ? <Tag className="h-3 w-3 text-muted-foreground" /> : <GitBranch className="h-3 w-3 text-muted-foreground" />}
              <span className="font-mono break-all">{d.ref}</span>
              <span className={d.sameFiles ? "text-primary" : "text-amber-700 dark:text-amber-400"}>{describeDifference(d)}</span>
              <span className="font-mono text-muted-foreground">{short(d.source) || "—"} → {short(d.destination) || "—"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Tone = "ok" | "info" | "warn" | "error" | "muted";

const TONE: Record<Tone, { dot: string; text: string }> = {
  ok: { dot: "bg-emerald-500", text: "text-foreground" },
  info: { dot: "bg-primary", text: "text-primary" },
  warn: { dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-400" },
  error: { dot: "bg-destructive", text: "text-destructive" },
  muted: { dot: "bg-muted-foreground/40", text: "text-muted-foreground" },
};

/** Collapses sync status + verification into the one thing worth knowing; colour only when attention is needed. */
function healthOf(sync: Pick<SyncOverview, "lastStatus" | "running" | "verifying" | "verification">): { tone: Tone; label: string; busy?: boolean } {
  if (sync.running) return { tone: "info", label: "Syncing", busy: true };
  if (sync.verifying) return { tone: "info", label: "Verifying", busy: true };
  if (sync.lastStatus === "failed") return { tone: "error", label: "Failed" };
  if (sync.lastStatus === "conflict") return { tone: "warn", label: "Conflict" };
  if (sync.lastStatus === "pending") return { tone: "muted", label: "Not run yet" };
  const v = sync.verification?.status;
  if (v === "identical") return { tone: "ok", label: "Exact replica" };
  if (v === "files_identical") return { tone: "ok", label: "Files identical" };
  if (v === "different") return { tone: "warn", label: "Not identical" };
  if (v === "error") return { tone: "error", label: "Verification failed" };
  return { tone: "muted", label: "In sync · not verified" };
}

export function SyncHealth({ sync }: { sync: Pick<SyncOverview, "lastStatus" | "running" | "verifying" | "verification" | "enabled"> }) {
  const h = healthOf(sync);
  const t = TONE[h.tone];
  return (
    <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-sm" title={sync.verification ? `Verified ${relativeTime(sync.verification.checkedAt)}` : undefined}>
      {h.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> : <span className={cn("h-2 w-2 rounded-full", t.dot)} />}
      <span className={cn("font-medium", t.text)}>{h.label}</span>
      {!sync.enabled && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><PauseCircle className="h-3 w-3" />Paused</span>}
    </span>
  );
}
