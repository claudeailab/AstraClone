"use client";

import { useEffect, useState } from "react";
import { Loader2, PauseCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { muted, sectionTitle } from "@/lib/ui-conventions";
import { nextRunAt, relativeTime, syncStatus, type SyncOverview, type SyncStatus } from "@/lib/sync-shared";
import { RunHistoryDots, RunHistoryList, SyncFacts, SyncRoute, SyncStatusBadge } from "@/components/sync/SyncDisplay";
import { cn } from "@/lib/utils";

const SUMMARY: SyncStatus[] = ["success", "conflict", "failed", "running"];

export default function SyncStatusBoard() {
  const [syncs, setSyncs] = useState<SyncOverview[] | null>(null);
  const [selected, setSelected] = useState<SyncOverview | null>(null);

  const anyRunning = syncs?.some(s => s.running) ?? false;
  useEffect(() => {
    let live = true;
    const poll = () => fetch("/api/syncs")
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (live && d) setSyncs(d.syncs ?? []); })
      .catch(() => {});
    poll();
    const t = setInterval(poll, anyRunning ? 3_000 : 15_000);
    return () => { live = false; clearInterval(t); };
  }, [anyRunning]);

  if (!syncs) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!syncs.length) return <p className={`text-center py-12 ${muted}`}>No synchronizations have been configured yet.</p>;

  const counts = Object.fromEntries(SUMMARY.map(k => [k, syncs.filter(s => s.lastStatus === k).length]));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {SUMMARY.map(k => (
          <div key={k} className="rounded-lg border bg-card p-4 flex flex-col gap-1">
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={cn("h-2 w-2 rounded-full", syncStatus(k).dot)} />{syncStatus(k).label}
            </span>
            <span className="text-2xl font-bold tabular-nums">{counts[k]}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className={sectionTitle}>Synchronizations</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {syncs.map(s => (
            <Card key={s.id}>
              <CardHeader className="pb-2 flex flex-col gap-1.5">
                <CardTitle className="text-base font-normal"><SyncRoute sync={s} /></CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <SyncStatusBadge status={s.lastStatus} />
                  {!s.enabled && <Badge variant="outline" className="gap-1"><PauseCircle className="h-3 w-3" />Paused</Badge>}
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <SyncFacts sync={s} />
                {s.lastMessage && <p className="text-sm break-words">{s.lastMessage}</p>}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs text-muted-foreground">
                      Last run {relativeTime(s.lastRunAt)}{s.enabled && !s.running ? ` · next ${relativeTime(nextRunAt(s))}` : ""}
                    </span>
                    <RunHistoryDots runs={s.recentRuns} />
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setSelected(s)}>Details</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Dialog open={selected !== null} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>Synchronization details</DialogTitle></DialogHeader>
          {selected && (
            <div className="flex flex-col gap-3">
              <SyncRoute sync={selected} />
              <SyncFacts sync={selected} />
              <RunHistoryList runs={selected.recentRuns} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
