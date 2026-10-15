"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Pencil, Trash2, Play, History, Check, ShieldCheck } from "lucide-react";
import { pageWrapper, pageInner, pageTitle, muted } from "@/lib/ui-conventions";
import { SYNC_DIRECTIONS, SYNC_INTERVALS, intervalLabel, routeLabel, type SyncDirection, type SyncOverview } from "@/lib/sync-shared";
import { RunHistoryList, SyncRoute, SyncRow, VerificationPanel, type RunDetail } from "@/components/sync/SyncDisplay";

interface Account { id: number; name: string; username: string }
interface AccountRepo { fullName: string; isPrivate: boolean; canPush: boolean }
type RepoList = AccountRepo[] | "loading" | { error: string };

const emptyForm = {
  id: 0, sourceConnectionId: "", sourceRepo: "", destConnectionId: "", destRepo: "", direction: "one_way" as SyncDirection,
  branches: [] as string[], allBranches: true, syncTags: true, forcePush: false, propagateDeletes: false, intervalMinutes: "15", enabled: true,
};
type SyncForm = typeof emptyForm;

async function fetchBranches(connectionId: string, repo: string): Promise<string[]> {
  const r = await fetch(`/api/admin/accounts/branches?id=${connectionId}&repo=${encodeURIComponent(repo)}`);
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? "Could not load branches");
  return d.branches ?? [];
}

function RepoPicker({ label, accounts, connectionId, repo, list, excludeRepo, needsPush, onAccount, onRepo }: {
  label: string; accounts: Account[]; connectionId: string; repo: string; list: RepoList | undefined;
  excludeRepo?: string; needsPush: boolean; onAccount: (id: string) => void; onRepo: (repo: string) => void;
}) {
  const repos = Array.isArray(list) ? list : [];
  const options = repo && !repos.some(r => r.fullName === repo) ? [{ fullName: repo, isPrivate: false, canPush: true }, ...repos] : repos;
  const placeholder = !connectionId ? "Select an account first" : list === "loading" || list === undefined ? "Loading repositories…" : options.length ? "Select a repository" : "No repositories found";
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div className="flex flex-col gap-2">
        <Select value={connectionId} onValueChange={onAccount}>
          <SelectTrigger><SelectValue placeholder="GitHub account" /></SelectTrigger>
          <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={repo} onValueChange={onRepo} disabled={!connectionId || !options.length}>
          <SelectTrigger className="font-mono"><SelectValue placeholder={placeholder} /></SelectTrigger>
          <SelectContent>
            {options.map(r => {
              const same = excludeRepo?.toLowerCase() === r.fullName.toLowerCase();
              const readOnly = needsPush && !r.canPush;
              return (
                <SelectItem key={r.fullName} value={r.fullName} disabled={same || readOnly} className="font-mono">
                  {r.fullName}{r.isPrivate ? " · private" : ""}{readOnly ? " · read only" : ""}{same ? " · same as source" : ""}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
      {list && typeof list === "object" && "error" in list && <p className="text-xs text-destructive">{list.error}</p>}
    </div>
  );
}

export default function SyncsPage() {
  const [syncs, setSyncs] = useState<SyncOverview[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [repoLists, setRepoLists] = useState<Record<string, RepoList>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SyncOverview | null>(null);
  const [history, setHistory] = useState<{ sync: SyncOverview; runs: RunDetail[] | null } | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [branchOptions, setBranchOptions] = useState<string[] | null>(null);
  const [branchError, setBranchError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [sr, ar] = await Promise.all([fetch("/api/admin/syncs"), fetch("/api/admin/accounts")]);
      const [sd, ad] = await Promise.all([sr.json(), ar.json()]);
      setSyncs(sd.syncs ?? []);
      setAccounts(ad.connections ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const anyRunning = syncs.some(s => s.running || s.verifying);
  useEffect(() => {
    const t = setInterval(load, anyRunning ? 3_000 : 30_000);
    return () => clearInterval(t);
  }, [load, anyRunning]);

  async function loadRepos(connectionId: string) {
    if (!connectionId || Array.isArray(repoLists[connectionId])) return;
    setRepoLists(m => ({ ...m, [connectionId]: "loading" }));
    const r = await fetch(`/api/admin/accounts/repos?id=${connectionId}`);
    const d = await r.json();
    setRepoLists(m => ({ ...m, [connectionId]: r.ok ? d.repos ?? [] : { error: d.error ?? "Could not load repositories" } }));
  }

  async function loadBranches(f: SyncForm) {
    setBranchOptions(null);
    setBranchError(null);
    if (!f.sourceRepo || (f.direction === "two_way" && !f.destRepo)) return;
    try {
      const lists = await Promise.all([
        fetchBranches(f.sourceConnectionId, f.sourceRepo),
        ...(f.direction === "two_way" ? [fetchBranches(f.destConnectionId, f.destRepo)] : []),
      ]);
      setBranchOptions([...new Set(lists.flat())].sort());
    } catch (e) {
      setBranchError(e instanceof Error ? e.message : "Could not load branches");
      setBranchOptions([]);
    }
  }

  function update(patch: Partial<SyncForm>) {
    const next = { ...form, ...patch };
    setForm(next);
    if ("sourceConnectionId" in patch) loadRepos(next.sourceConnectionId);
    if ("destConnectionId" in patch) loadRepos(next.destConnectionId);
    if ("sourceRepo" in patch || "destRepo" in patch || "direction" in patch) loadBranches(next);
  }

  function openForm(next: SyncForm) {
    setForm(next);
    setDialogOpen(true);
    loadRepos(next.sourceConnectionId);
    loadRepos(next.destConnectionId);
    loadBranches(next);
  }

  function openEdit(s: SyncOverview) {
    const branches = s.branches.split(",").map(b => b.trim()).filter(Boolean);
    openForm({
      id: s.id, sourceConnectionId: String(s.sourceConnectionId), sourceRepo: s.source,
      destConnectionId: String(s.destConnectionId), destRepo: s.destination, direction: s.direction,
      branches, allBranches: !branches.length, syncTags: s.syncTags, forcePush: s.forcePush, propagateDeletes: s.propagateDeletes, intervalMinutes: String(s.intervalMinutes), enabled: s.enabled,
    });
  }

  function toggleBranch(b: string) {
    setForm(f => ({ ...f, branches: f.branches.includes(b) ? f.branches.filter(x => x !== b) : [...f.branches, b] }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const body = {
        ...(form.id ? { id: form.id } : {}),
        sourceConnectionId: Number(form.sourceConnectionId), sourceRepo: form.sourceRepo,
        destConnectionId: Number(form.destConnectionId), destRepo: form.destRepo, direction: form.direction,
        branches: form.allBranches ? "" : form.branches.join(", "), syncTags: form.syncTags, forcePush: form.forcePush, propagateDeletes: form.propagateDeletes, intervalMinutes: Number(form.intervalMinutes), enabled: form.enabled,
      };
      const r = await fetch("/api/admin/syncs", {
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
    const r = await fetch("/api/admin/syncs/run", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: s.id }),
    });
    const d = await r.json();
    if (!r.ok) { toast.error(d.error ?? "Could not start"); return; }
    toast.success(`Started ${routeLabel(s)}`);
    load();
  }

  async function handleVerify(s: SyncOverview) {
    const r = await fetch("/api/admin/syncs/verify", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: s.id }),
    });
    const d = await r.json();
    if (!r.ok) { toast.error(d.error ?? "Could not start verification"); return; }
    toast.success(`Verifying ${routeLabel(s)}`);
    load();
  }

  async function openHistory(s: SyncOverview) {
    setHistory({ sync: s, runs: null });
    const r = await fetch(`/api/syncs/runs?id=${s.id}`);
    const d = await r.json();
    setHistory({ sync: s, runs: d.runs ?? [] });
  }

  async function handleDelete(s: SyncOverview) {
    const r = await fetch(`/api/admin/syncs?id=${s.id}`, { method: "DELETE" });
    if (!r.ok) { toast.error("Delete failed"); return; }
    toast.success("Synchronization deleted");
    setDeleteTarget(null);
    load();
  }

  const single = accounts.length === 1 ? String(accounts[0].id) : "";
  const formValid = form.sourceRepo && form.destRepo && form.sourceRepo.toLowerCase() !== form.destRepo.toLowerCase()
    && (form.allBranches || form.branches.length > 0);
  const intervalOptions = SYNC_INTERVALS.includes(Number(form.intervalMinutes)) ? SYNC_INTERVALS : [...SYNC_INTERVALS, Number(form.intervalMinutes)].sort((a, b) => a - b);
  const branchChoices = [...new Set([...(branchOptions ?? []), ...form.branches])].sort();

  return (
    <div className={pageWrapper}>
      <div className={pageInner}>
        <div className="flex items-center justify-between gap-4 mb-2">
          <h1 className={pageTitle}>Synchronizations</h1>
          <Button size="sm" onClick={() => openForm({ ...emptyForm, sourceConnectionId: single, destConnectionId: single })} disabled={!accounts.length}><Plus className="h-4 w-4 mr-1" /> New Sync</Button>
        </div>
        <p className={`${muted} mb-6`}>Choose what synchronizes where, in which direction and how often.</p>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : !accounts.length && !syncs.length ? (
          <p className={`text-center py-12 ${muted}`}>
            Add a <Link href="/admin/accounts" className="text-primary underline-offset-4 hover:underline">GitHub account</Link> first.
          </p>
        ) : syncs.length === 0 ? (
          <p className={`text-center py-12 ${muted}`}>No synchronizations yet.</p>
        ) : (
          <Card className="divide-y overflow-hidden">
            {syncs.map(s => (
              <SyncRow
                key={s.id}
                sync={s}
                actions={
                  <>
                    <Button size="icon" variant="ghost" className="text-primary hover:text-primary" onClick={() => handleRun(s)} disabled={s.running || s.verifying} aria-label="Run now" title="Run now">
                      {s.running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    </Button>
                    <Button size="icon" variant="ghost" aria-label="Verify" title="Verify replica" onClick={() => handleVerify(s)} disabled={s.running || s.verifying}><ShieldCheck className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label="History" title="History" onClick={() => openHistory(s)}><History className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label="Edit" title="Edit" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-destructive" aria-label="Delete" title="Delete" onClick={() => setDeleteTarget(s)}><Trash2 className="h-4 w-4" /></Button>
                  </>
                }
              />
            ))}
          </Card>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg md:max-w-3xl max-h-[90dvh] overflow-y-auto md:max-h-none md:overflow-visible">
            <DialogHeader><DialogTitle>{form.id ? "Edit Synchronization" : "New Synchronization"}</DialogTitle></DialogHeader>
            <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
              <div className="flex flex-col gap-4">
                <RepoPicker
                  label="Source"
                  accounts={accounts}
                  connectionId={form.sourceConnectionId}
                  repo={form.sourceRepo}
                  list={repoLists[form.sourceConnectionId]}
                  needsPush={form.direction === "two_way"}
                  onAccount={v => update({ sourceConnectionId: v, sourceRepo: "", branches: [] })}
                  onRepo={v => update({ sourceRepo: v, branches: [] })}
                />
                <RepoPicker
                  label="Destination"
                  accounts={accounts}
                  connectionId={form.destConnectionId}
                  repo={form.destRepo}
                  list={repoLists[form.destConnectionId]}
                  excludeRepo={form.sourceRepo}
                  needsPush
                  onAccount={v => update({ destConnectionId: v, destRepo: "" })}
                  onRepo={v => update({ destRepo: v })}
                />
                <div className="flex flex-col gap-1.5">
                  <Label>Direction</Label>
                  <Select value={form.direction} onValueChange={v => update({ direction: v as SyncDirection })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{SYNC_DIRECTIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {form.direction === "one_way" ? "Source → destination only. The source is never changed." : "Changes flow whichever way is ahead; branches changed on both sides are left as conflicts."}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center justify-between gap-4">
                    <span className="text-sm font-medium">All branches</span>
                    <Switch checked={form.allBranches} onCheckedChange={v => setForm(f => ({ ...f, allBranches: v }))} />
                  </label>
                  {!form.allBranches && (
                    !form.sourceRepo ? (
                      <p className="text-xs text-muted-foreground">Select a source to choose branches.</p>
                    ) : branchOptions === null ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading branches…</div>
                    ) : (
                      <>
                        {branchError && <p className="text-xs text-destructive">{branchError}</p>}
                        <div className="rounded-lg border divide-y divide-border max-h-40 overflow-y-auto">
                          {branchChoices.map(b => {
                            const checked = form.branches.includes(b);
                            return (
                              <button
                                key={b}
                                type="button"
                                role="checkbox"
                                aria-checked={checked}
                                onClick={() => toggleBranch(b)}
                                className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-secondary/50 ${checked ? "bg-primary/5" : ""}`}
                              >
                                <span className={`h-4 w-4 rounded border shrink-0 flex items-center justify-center transition-colors ${checked ? "bg-primary border-primary text-primary-foreground" : "border-border"}`}>
                                  {checked && <Check className="h-3 w-3" />}
                                </span>
                                <span className="text-sm font-mono truncate">{b}</span>
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-xs text-muted-foreground">{form.branches.length} selected{form.direction === "two_way" ? " · from both repositories" : " · from the source"}</p>
                      </>
                    )
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label>Check every</Label>
                  <Select value={form.intervalMinutes} onValueChange={v => setForm(f => ({ ...f, intervalMinutes: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{intervalOptions.map(m => <SelectItem key={m} value={String(m)}>{intervalLabel(m)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-3 rounded-lg border p-3">
                  <label className="flex items-center justify-between gap-4">
                    <span className="flex flex-col">
                      <span className="text-sm">{form.direction === "one_way" ? "Delete in destination when deleted in source" : "Mirror deletions both ways"}</span>
                      <span className="text-xs text-muted-foreground">Only if the other side has no commits of its own on it.</span>
                    </span>
                    <Switch checked={form.propagateDeletes} onCheckedChange={v => setForm(f => ({ ...f, propagateDeletes: v }))} />
                  </label>
                  <label className="flex items-center justify-between gap-4">
                    <span className="text-sm">Synchronize tags</span>
                    <Switch checked={form.syncTags} onCheckedChange={v => setForm(f => ({ ...f, syncTags: v }))} />
                  </label>
                  {form.direction === "one_way" && (
                    <label className="flex items-center justify-between gap-4">
                      <span className="flex flex-col">
                        <span className="text-sm">Overwrite destination changes</span>
                        <span className="text-xs text-muted-foreground">Commits made directly in the destination are replaced with the source&apos;s version.</span>
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
            <DialogHeader><DialogTitle>History</DialogTitle></DialogHeader>
            {history && <SyncRoute sync={history.sync} />}
            {history && <VerificationPanel verification={syncs.find(x => x.id === history.sync.id)?.verification ?? history.sync.verification} verifying={syncs.find(x => x.id === history.sync.id)?.verifying} />}
            {history?.runs ? <RunHistoryList runs={history.runs} /> : <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>}
          </DialogContent>
        </Dialog>

        <Dialog open={deleteTarget !== null} onOpenChange={() => setDeleteTarget(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Delete Synchronization</DialogTitle></DialogHeader>
            <p className="text-sm">Delete <span className="font-mono font-medium">{deleteTarget && routeLabel(deleteTarget)}</span> and its run history? The repositories are not affected.</p>
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
