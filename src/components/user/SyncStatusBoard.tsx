"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { muted, sectionTitle } from "@/lib/ui-conventions";
import { syncStatus, type SyncOverview, type SyncStatus } from "@/lib/sync-shared";
import { RunHistoryList, SyncFacts, SyncRoute, SyncRow, VerificationPanel, type RunDetail } from "@/components/sync/SyncDisplay";
import { cn } from "@/lib/utils";

const SUMMARY: SyncStatus[] = ["success", "conflict", "failed", "running"];

export default function SyncStatusBoard() {
  const [syncs, setSyncs] = useState<SyncOverview[] | null>(null);
  const [selected, setSelected] = useState<{ sync: SyncOverview; runs: RunDetail[] | null } | null>(null);

  async function openDetails(sync: SyncOverview) {
    setSelected({ sync, runs: null });
    const r = await fetch(`/api/syncs/runs?id=${sync.id}`);
    const d = r.ok ? await r.json() : { runs: [] };
    setSelected({ sync, runs: d.runs ?? [] });
  }

  const anyRunning = syncs?.some(s => s.running || s.verifying) ?? false;
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
        <Card className="divide-y overflow-hidden">
          {syncs.map(s => (
            <SyncRow key={s.id} sync={s} actions={<Button size="sm" variant="outline" onClick={() => openDetails(s)}>Details</Button>} />
          ))}
        </Card>
      </div>

      <Dialog open={selected !== null} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>Synchronization details</DialogTitle></DialogHeader>
          {selected && (
            <div className="flex flex-col gap-3">
              <SyncRoute sync={selected.sync} />
              <SyncFacts sync={selected.sync} />
              <VerificationPanel verification={selected.sync.verification} verifying={selected.sync.verifying} />
              {selected.runs ? <RunHistoryList runs={selected.runs} /> : <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
