"use client";

import { ArrowLeftRight, ArrowRight, Clock, GitBranch, Loader2, Tag, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { intervalLabel, syncStatus, type SyncOverview, type SyncRunSummary } from "@/lib/sync-shared";

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

export function RunHistoryList({ runs }: { runs: (SyncRunSummary & { details?: string | null })[] }) {
  if (!runs.length) return <p className="text-sm text-muted-foreground py-6 text-center">No runs yet.</p>;
  return (
    <ul className="divide-y divide-border">
      {runs.map(r => (
        <li key={r.id} className="py-3 flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <SyncStatusBadge status={r.status} />
            <span className="text-xs text-muted-foreground">
              {new Date(r.startedAt).toLocaleString()} · {r.triggeredBy}{duration(r) ? ` · ${duration(r)}` : ""}
            </span>
          </div>
          {r.message && <p className="text-sm break-words">{r.message}</p>}
          {r.details && <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words font-mono">{r.details}</pre>}
        </li>
      ))}
    </ul>
  );
}

export function SyncFacts({ sync }: { sync: Pick<SyncOverview, "direction" | "branches" | "syncTags" | "forcePush" | "intervalMinutes"> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge variant="secondary" className="gap-1">
        {sync.direction === "two_way" ? <ArrowLeftRight className="h-3 w-3" /> : <ArrowRight className="h-3 w-3" />}
        {sync.direction === "two_way" ? "Two-way" : "One-way"}
      </Badge>
      <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />{intervalLabel(sync.intervalMinutes)}</Badge>
      <Badge variant="secondary" className="gap-1 font-mono"><GitBranch className="h-3 w-3" />{sync.branches || "all branches"}</Badge>
      {sync.syncTags && <Badge variant="secondary" className="gap-1"><Tag className="h-3 w-3" />Tags</Badge>}
      {sync.forcePush && <Badge className="gap-1 border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400"><Zap className="h-3 w-3" />Force push</Badge>}
    </div>
  );
}
