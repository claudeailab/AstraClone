"use client";

import { AlertTriangle, ArrowLeftRight, ArrowRight, ChevronRight, Clock, GitBranch, Loader2, ShieldAlert, ShieldCheck, ShieldQuestion, Tag, Trash2, XCircle, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { FILE_STATUS, VERIFY_STATUS, intervalLabel, nextRunAt, relativeTime, syncStatus, type RefChange, type SyncOverview, type SyncProgress, type SyncRunSummary, type Verification } from "@/lib/sync-shared";


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

const shortDate = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export function RunHistoryList({ runs }: { runs: RunDetail[] }) {
  if (!runs.length) return <p className="text-sm text-muted-foreground py-6 text-center">No runs yet.</p>;
  return (
    <ul className="divide-y divide-border">
      {runs.map(r => {
        const conflicts = (r.details ?? "").split("\n").filter(l => l.includes("CONFLICT"));
        const v = r.verification ? VERIFY_STATUS[r.verification.status] : null;
        return (
          <li key={r.id} className="flex flex-col gap-1 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", syncStatus(r.status).dot)} title={syncStatus(r.status).label} />
                <span className="truncate text-sm" title={r.message ?? undefined}>{r.message ?? syncStatus(r.status).label}</span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{shortDate(r.startedAt)}</span>
            </div>
            <p className="pl-4 text-xs text-muted-foreground">
              {[r.triggeredBy, duration(r)].filter(Boolean).join(" · ")}
              {v && <> · <span className={v.text === "text-foreground" ? "" : v.text}>{v.label}</span></>}
              {r.filesChanged > 0 && <> · {r.filesChanged} file{r.filesChanged === 1 ? "" : "s"} changed</>}
            </p>
            {r.changes.length > 0 && <ul className="flex flex-col pl-4">{r.changes.map((c, i) => <RefChangeItem key={i} c={c} />)}</ul>}
            {conflicts.length > 0 && (
              <ul className="flex flex-col gap-0.5 pl-4">
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


export function VerificationBadge({ verification }: { verification: Verification | null }) {
  if (!verification) return <span className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ShieldQuestion className="h-3.5 w-3.5" />Not verified</span>;
  const v = VERIFY_STATUS[verification.status];
  return (
    <span className="inline-flex items-center gap-2 text-sm" title={`Checked ${relativeTime(verification.checkedAt)}`}>
      <span className={cn("h-2 w-2 rounded-full", v.dot)} />
      <span className={cn("font-medium", v.text)}>{v.label}</span>
    </span>
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


/** Shared detail view (admin History and user Details): fixed summary on top, only the run list scrolls. */
export function SyncDetails({ sync, runs }: { sync: SyncOverview; runs: RunDetail[] | null }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-col gap-2">
        <SyncRoute sync={sync} />
        <SyncFacts sync={sync} />
      </div>
      <VerificationPanel verification={sync.verification} verifying={sync.verifying} />
      <div className="flex min-h-0 flex-1 flex-col gap-1">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Runs</h3>
        <div className="-mr-3 min-h-0 flex-1 overflow-y-auto pr-3">
          {runs ? <RunHistoryList runs={runs} /> : <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>}
        </div>
      </div>
    </div>
  );
}

export type Tone = "ok" | "info" | "warn" | "error" | "muted";

const TONE: Record<Tone, { tile: string; text: string }> = {
  ok: { tile: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400", text: "text-emerald-700 dark:text-emerald-400" },
  info: { tile: "bg-primary/12 text-primary", text: "text-primary" },
  warn: { tile: "bg-amber-500/15 text-amber-600 dark:text-amber-400", text: "text-amber-700 dark:text-amber-400" },
  error: { tile: "bg-destructive/12 text-destructive", text: "text-destructive" },
  muted: { tile: "bg-secondary text-muted-foreground", text: "text-muted-foreground" },
};

/** Sync status + verification collapsed into the one thing worth knowing. */
function healthOf(sync: Pick<SyncOverview, "lastStatus" | "running" | "verifying" | "verification" | "enabled">): { tone: Tone; label: string; icon: React.ElementType; spin?: boolean } {
  if (sync.running) return { tone: "info", label: "Syncing", icon: Loader2, spin: true };
  if (sync.verifying) return { tone: "info", label: "Verifying", icon: Loader2, spin: true };
  if (sync.lastStatus === "failed") return { tone: "error", label: "Failed", icon: XCircle };
  if (sync.lastStatus === "conflict") return { tone: "warn", label: "Conflict", icon: AlertTriangle };
  if (sync.lastStatus === "pending") return { tone: "muted", label: "Not run yet", icon: Clock };
  const v = sync.verification?.status;
  if (v === "identical") return { tone: "ok", label: "Exact replica", icon: ShieldCheck };
  if (v === "files_identical") return { tone: "ok", label: "Files identical", icon: ShieldCheck };
  if (v === "different") return { tone: "warn", label: "Not identical", icon: ShieldAlert };
  if (v === "error") return { tone: "error", label: "Verification failed", icon: ShieldAlert };
  return { tone: "muted", label: "Not verified", icon: ShieldQuestion };
}

const split = (full: string) => { const i = full.indexOf("/"); return i < 0 ? { owner: "", name: full } : { owner: full.slice(0, i), name: full.slice(i + 1) }; };

export function shortInterval(minutes: number) {
  if (minutes === 60) return "Hourly";
  if (minutes === 1440) return "Daily";
  if (minutes % 1440 === 0) return `Every ${minutes / 1440} days`;
  if (minutes % 60 === 0) return `Every ${minutes / 60} h`;
  return `Every ${minutes} min`;
}

/**
 * One synchronization: tinted status tile · repository name + "owner → owner · schedule" · status + last result · actions.
 * The row content opens the details view; actions sit beside it, so clicking them never opens details.
 */
export function SyncRow({ sync, onOpen, actions }: { sync: SyncOverview; onOpen: () => void; actions: React.ReactNode }) {
  const h = healthOf(sync);
  const t = TONE[h.tone];
  const src = split(sync.source), dst = split(sync.destination);
  const title = src.name.toLowerCase() === dst.name.toLowerCase() ? src.name : `${src.name} → ${dst.name}`;
  const arrow = sync.direction === "two_way" ? "⇄" : "→";
  const subtitle = [`${src.owner} ${arrow} ${dst.owner}`, shortInterval(sync.intervalMinutes), sync.branches || null].filter(Boolean).join(" · ");
  const busy = sync.running || sync.verifying;
  return (
    <div className="flex items-center gap-2 pr-3 transition-colors hover:bg-secondary/50 has-[:focus-visible]:bg-secondary/50">
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-4 py-3.5 pl-4 focus-visible:outline-none"
      >
      <StatusTile tone={h.tone} icon={h.icon} spin={h.spin} />
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-semibold" title={`${sync.source} ${arrow} ${sync.destination}`}>{title}</span>
            {!sync.enabled && <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">Paused</span>}
          </span>
          <span className="text-sm text-muted-foreground sm:truncate">{subtitle}</span>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5 sm:w-56 sm:items-end sm:text-right">
          <span className={cn("text-sm font-medium", t.text)}>{h.label}</span>
          {busy
            ? <div className="w-full"><SyncProgressBar progress={sync.progress} /></div>
            : <span className="truncate text-xs text-muted-foreground" title={sync.lastMessage ?? undefined}>
                {sync.lastRunAt ? `${sync.lastMessage ?? ""} · ${relativeTime(sync.lastRunAt)}` : sync.enabled ? `Runs ${relativeTime(nextRunAt(sync))}` : "Paused"}
              </span>}
        </div>
      </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">{actions}</div>
    </div>
  );
}

/** Tinted rounded icon square — the one place colour lives in sync lists and summaries. */
export function StatusTile({ tone, icon: Icon, spin }: { tone: Tone; icon: React.ElementType; spin?: boolean }) {
  return (
    <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", TONE[tone].tile)}>
      <Icon className={cn("h-5 w-5", spin && "animate-spin")} />
    </div>
  );
}
