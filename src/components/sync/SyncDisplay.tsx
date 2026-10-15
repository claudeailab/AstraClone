"use client";

import { ArrowLeftRight, ArrowRight, ChevronRight, Clock, FileText, GitBranch, History, Loader2, Tag, Trash2, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FILE_STATUS, intervalLabel, syncStatus, type RefChange, type SyncOverview, type SyncProgress, type SyncRunSummary } from "@/lib/sync-shared";

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
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-mono min-w-0">
      <span className="truncate">{sync.source}</span>
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-label={sync.direction === "two_way" ? "two-way" : "one-way"} />
      <span className="truncate">{sync.destination}</span>
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

export interface RunDetail extends SyncRunSummary { details: string | null; changes: RefChange[] }

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

export function SyncFacts({ sync }: { sync: Pick<SyncOverview, "direction" | "branches" | "syncTags" | "forcePush" | "intervalMinutes" | "mode" | "propagateDeletes"> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge variant="secondary" className="gap-1">
        {sync.direction === "two_way" ? <ArrowLeftRight className="h-3 w-3" /> : <ArrowRight className="h-3 w-3" />}
        {sync.direction === "two_way" ? "Two-way" : "One-way"}
      </Badge>
      <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />{intervalLabel(sync.intervalMinutes)}</Badge>
      <Badge variant="secondary" className="gap-1 font-mono"><GitBranch className="h-3 w-3" />{sync.branches || "all branches"}</Badge>
      {sync.syncTags && <Badge variant="secondary" className="gap-1"><Tag className="h-3 w-3" />Tags</Badge>}
      {sync.mode === "changes" && <Badge variant="secondary" className="gap-1"><History className="h-3 w-3" />Changes only</Badge>}
      {sync.propagateDeletes && <Badge variant="secondary" className="gap-1"><Trash2 className="h-3 w-3" />Mirrors deletions</Badge>}
      {sync.forcePush && <Badge className="gap-1 border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400"><Zap className="h-3 w-3" />Force push</Badge>}
    </div>
  );
}
