"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Pencil, Trash2, Play, History, Clock, GitBranch, Tag, PauseCircle } from "lucide-react";
import { pageWrapper, pageInner, pageTitle, muted } from "@/lib/ui-conventions";
import { SYNC_DIRECTIONS, nextRunAt, relativeTime, type SyncDirection, type SyncOverview, type SyncRunSummary } from "@/lib/sync-shared";
import { RunHistoryDots, RunHistoryList, SyncRoute, SyncStatusBadge } from "@/components/sync/SyncDisplay";

interface Repo { id: number; owner: string; name: string; canPush: boolean; connectionName: string }

const emptyForm = {
  id: 0, name: "", sourceRepoId: "", destRepoId: "", direction: "one_way" as SyncDirection,
  branches: "", syncTags: true, forcePush: false, intervalMinutes: "15", enabled: true,
};

export default function SyncsPage() {
  const [syncs, setSyncs] = useState<SyncOverview[]>([]);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SyncOverview | null>(null);
  const [history, setHistory] = useState<{ sync: SyncOverview; runs: (SyncRunSummary & { details: string | null })[] | null } | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [sr, rr] = await Promise.all([fetch("/api/admin/management/syncs"), fetch("/api/admin/management/repositories")]);
      const [sd, rd] = await Promise.all([sr.json(), rr.json()]);
      setSyncs(sd.syncs ?? []);
      setRepos(rd.repositories ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const anyRunning = syncs.some(s => s.running);
  useEffect(() => {
    const t = setInterval(load, anyRunning ? 3_000 : 30_000);
    return () => clearInterval(t);
  }, [load, anyRunning]);

  function openEdit(s: SyncOverview) {
    setForm({
      id: s.id, name: s.name, sourceRepoId: String(s.sourceRepoId), destRepoId: String(s.destRepoId), direction: s.direction,
      branches: s.branches, syncTags: s.syncTags, forcePush: s.forcePush, intervalMinutes: String(s.intervalMinutes), enabled: s.enabled,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const body = {
        ...(form.id ? { id: form.id } : {}),
        name: form.name, sourceRepoId: Number(form.sourceRepoId), destRepoId: Number(form.destRepoId), direction: form.direction,
        branches: form.branches, syncTags: form.syncTags, forcePush: form.forcePush, intervalMinutes: Number(form.intervalMinutes), enabled: form.enabled,
      };
      const r = await fetch("/api/admin/management/syncs", {
        method: form.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Save failed"); return; }
      toast.success(form.id ? "Synchronization updated" : "Synchronization created");
      setDialogOpen(false);
      load();
    } finally { setSaving(false); }
  }

  async function handleRun(s: SyncOverview) {
    const r = await fetch("/api/admin/management/syncs/run", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: s.id }),
    });
    const d = await r.json();
    if (!r.ok) { toast.error(d.error ?? "Could not start"); return; }
    toast.success(`Started ${s.name}`);
    load();
  }

  async function openHistory(s: SyncOverview) {
    setHistory({ sync: s, runs: null });
    const r = await fetch(`/api/admin/management/syncs/runs?id=${s.id}`);
    const d = await r.json();
    setHistory({ sync: s, runs: d.runs ?? [] });
  }

  async function handleDelete(s: SyncOverview) {
    const r = await fetch(`/api/admin/management/syncs?id=${s.id}`, { method: "DELETE" });
    if (!r.ok) { toast.error("Delete failed"); return; }
    toast.success("Synchronization deleted");
    setDeleteTarget(null);
    load();
  }

  const repoLabel = (r: Repo) => `${r.owner}/${r.name} · ${r.connectionName}${r.canPush ? "" : " (read only)"}`;
  const interval = Number(form.intervalMinutes);
  const formValid = form.name.trim() && form.sourceRepoId && form.destRepoId && form.sourceRepoId !== form.destRepoId
    && Number.isInteger(interval) && interval >= 1 && interval <= 1440;

  return (
    <div className={pageWrapper}>
      <div className={pageInner}>
        <div className="flex items-center justify-between gap-4 mb-2">
          <h1 className={pageTitle}>Synchronizations</h1>
          <Button size="sm" onClick={() => { setForm(emptyForm); setDialogOpen(true); }} disabled={repos.length < 2}><Plus className="h-4 w-4 mr-1" /> New Sync</Button>
        </div>
        <p className={`${muted} mb-6`}>Choose what synchronizes where, in which direction and how often.</p>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : repos.length < 2 && !syncs.length ? (
          <p className={`text-center py-12 ${muted}`}>
            Add at least two <Link href="/admin/management/repositories" className="text-primary underline-offset-4 hover:underline">repositories</Link> first.
          </p>
        ) : syncs.length === 0 ? (
          <p className={`text-center py-12 ${muted}`}>No synchronizations yet.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {syncs.map(s => (
              <Card key={s.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                  <div className="min-w-0 flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-base truncate">{s.name}</CardTitle>
                      <SyncStatusBadge status={s.lastStatus} />
                      {!s.enabled && <Badge variant="outline" className="gap-1"><PauseCircle className="h-3 w-3" />Paused</Badge>}
                    </div>
                    <SyncRoute sync={s} />
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" aria-label="Edit" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => setDeleteTarget(s)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Every {s.intervalMinutes}m</Badge>
                    <Badge variant="secondary" className="gap-1 font-mono"><GitBranch className="h-3 w-3" />{s.branches || "all branches"}</Badge>
                    {s.syncTags && <Badge variant="secondary" className="gap-1"><Tag className="h-3 w-3" />Tags</Badge>}
                    {s.forcePush && <Badge className="border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400">Force push</Badge>}
                  </div>
                  {s.lastMessage && <p className="text-sm break-words">{s.lastMessage}</p>}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs text-muted-foreground">
                        Last run {relativeTime(s.lastRunAt)}{s.enabled && !s.running ? ` · next ${relativeTime(nextRunAt(s))}` : ""}
                      </span>
                      <RunHistoryDots runs={s.recentRuns} />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openHistory(s)}><History className="h-4 w-4 mr-1" />History</Button>
                      <Button size="sm" onClick={() => handleRun(s)} disabled={s.running}>
                        {s.running ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Play className="h-4 w-4 mr-1" />Run now</>}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
            <DialogHeader><DialogTitle>{form.id ? "Edit Synchronization" : "New Synchronization"}</DialogTitle></DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Name</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Mirror app to backup org" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label>Source</Label>
                  <Select value={form.sourceRepoId} onValueChange={v => setForm(f => ({ ...f, sourceRepoId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select repository" /></SelectTrigger>
                    <SelectContent>{repos.map(r => <SelectItem key={r.id} value={String(r.id)}>{repoLabel(r)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Destination</Label>
                  <Select value={form.destRepoId} onValueChange={v => setForm(f => ({ ...f, destRepoId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select repository" /></SelectTrigger>
                    <SelectContent>{repos.filter(r => String(r.id) !== form.sourceRepoId).map(r => <SelectItem key={r.id} value={String(r.id)}>{repoLabel(r)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Direction</Label>
                <Select value={form.direction} onValueChange={v => setForm(f => ({ ...f, direction: v as SyncDirection }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SYNC_DIRECTIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {form.direction === "one_way"
                    ? "Branches and tags flow from source to destination only."
                    : "New commits flow whichever way is ahead. Branches changed on both sides are reported as conflicts and left untouched."}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label>Branches</Label>
                  <Input value={form.branches} onChange={e => setForm(f => ({ ...f, branches: e.target.value }))} placeholder="All branches" className="font-mono" />
                  <p className="text-xs text-muted-foreground">Comma-separated, <span className="font-mono">*</span> wildcard, e.g. <span className="font-mono">main, release/*</span></p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Check every (minutes)</Label>
                  <Input type="number" min={1} max={1440} value={form.intervalMinutes} onChange={e => setForm(f => ({ ...f, intervalMinutes: e.target.value }))} />
                </div>
              </div>
              <div className="flex flex-col gap-3 rounded-lg border p-3">
                <label className="flex items-center justify-between gap-4">
                  <span className="text-sm">Synchronize tags</span>
                  <Switch checked={form.syncTags} onCheckedChange={v => setForm(f => ({ ...f, syncTags: v }))} />
                </label>
                {form.direction === "one_way" && (
                  <label className="flex items-center justify-between gap-4">
                    <span className="flex flex-col">
                      <span className="text-sm">Force push</span>
                      <span className="text-xs text-muted-foreground">Overwrite destination changes that are not in the source</span>
                    </span>
                    <Switch checked={form.forcePush} onCheckedChange={v => setForm(f => ({ ...f, forcePush: v }))} />
                  </label>
                )}
                <label className="flex items-center justify-between gap-4">
                  <span className="text-sm">Enabled</span>
                  <Switch checked={form.enabled} onCheckedChange={v => setForm(f => ({ ...f, enabled: v }))} />
                </label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !formValid}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={history !== null} onOpenChange={() => setHistory(null)}>
          <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
            <DialogHeader><DialogTitle>{history?.sync.name} — History</DialogTitle></DialogHeader>
            {history?.runs ? <RunHistoryList runs={history.runs} /> : <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>}
          </DialogContent>
        </Dialog>

        <Dialog open={deleteTarget !== null} onOpenChange={() => setDeleteTarget(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Delete Synchronization</DialogTitle></DialogHeader>
            <p className="text-sm">Delete <span className="font-medium">{deleteTarget?.name}</span> and its run history? The repositories are not affected.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => deleteTarget && handleDelete(deleteTarget)}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
