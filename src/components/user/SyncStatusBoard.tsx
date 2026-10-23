"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ChevronRight, Loader2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { muted, sectionTitle } from "@/lib/ui-conventions";
import type { SyncOverview, SyncStatus } from "@/lib/sync-shared";
import { StatusTile, SyncDetails, SyncRow, type RunDetail, type Tone } from "@/components/sync/SyncDisplay";

const SUMMARY: { key: SyncStatus; label: string; tone: Tone; icon: React.ElementType }[] = [
  { key: "success", label: "In sync", tone: "ok", icon: ShieldCheck },
  { key: "conflict", label: "Conflict", tone: "warn", icon: AlertTriangle },
  { key: "failed", label: "Failed", tone: "error", icon: XCircle },
  { key: "running", label: "Running", tone: "info", icon: RefreshCw },
];

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

  const counts = Object.fromEntries(SUMMARY.map(({ key }) => [key, syncs.filter(s => s.lastStatus === key).length]));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {SUMMARY.map(({ key, label, tone, icon }) => (
          <div key={key} className="flex items-center gap-3 rounded-lg border bg-card p-4">
            <StatusTile tone={counts[key] ? tone : "muted"} icon={icon} />
            <div className="flex flex-col">
              <span className="text-2xl font-bold leading-tight tabular-nums">{counts[key]}</span>
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className={sectionTitle}>Synchronizations</h2>
        <Card className="divide-y overflow-hidden">
          {syncs.map(s => (
            <SyncRow key={s.id} sync={s} onOpen={() => openDetails(s)} actions={<ChevronRight className="h-4 w-4 text-muted-foreground" />} />
          ))}
        </Card>
      </div>

      <Dialog open={selected !== null} onOpenChange={() => setSelected(null)}>
        <DialogContent className="flex max-h-[85dvh] max-w-2xl flex-col overflow-hidden" onOpenAutoFocus={e => e.preventDefault()}>
          <DialogHeader><DialogTitle>Synchronization details</DialogTitle></DialogHeader>
          {selected && <SyncDetails sync={syncs.find(x => x.id === selected.sync.id) ?? selected.sync} runs={selected.runs} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
