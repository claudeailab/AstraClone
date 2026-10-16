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
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Loader2, Plus, Pencil, Trash2, Play, History, Check, ShieldCheck, ChevronDown, ArrowRight, ArrowLeftRight } from "lucide-react";
import { pageWrapper, pageInner, pageTitle, muted } from "@/lib/ui-conventions";
import { SYNC_INTERVALS, intervalLabel, routeLabel, type SyncDirection, type SyncOverview } from "@/lib/sync-shared";
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

const triggerClass = "flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
const sectionTitle = "text-xs font-semibold uppercase tracking-widest text-muted-foreground";
const rowGrid = "grid gap-2 sm:grid-cols-[6rem_minmax(0,1fr)] sm:items-center";

/** "Source" / "Destination": label, account and repository on one line. */
function RepoRow({ label, accounts, connectionId, repo, list, excludeRepo, needsPush, onAccount, onRepo }: {
  label: string; accounts: Account[]; connectionId: string; repo: string; list: RepoList | undefined;
  excludeRepo?: string; needsPush: boolean; onAccount: (id: string) => void; onRepo: (repo: string) => void;
}) {
  const repos = Array.isArray(list) ? list : [];
  const options = repo && !repos.some(r => r.fullName === repo) ? [{ fullName: repo, isPrivate: false, canPush: true }, ...repos] : repos;
  const placeholder = !connectionId ? "Repository" : list === "loading" || list === undefined ? "Loading…" : options.length ? "Repository" : "No repositories";
  const error = list && typeof list === "object" && "error" in list ? list.error : null;
  return (
    <div className="grid gap-2 sm:grid-cols-[6rem_minmax(0,2fr)_minmax(0,3fr)] sm:items-center">
      <Label className="text-sm text-muted-foreground">{label}</Label>
      <Select value={connectionId} onValueChange={onAccount}>
        <SelectTrigger aria-label={`${label} account`}><SelectValue placeholder="Account" /></SelectTrigger>
        <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={repo} onValueChange={onRepo} disabled={!connectionId || !options.length}>
        <SelectTrigger aria-label={`${label} repository`}><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          {options.map(r => {
            const same = excludeRepo?.toLowerCase() === r.fullName.toLowerCase();
            const readOnly = needsPush && !r.canPush;
            return (
              <SelectItem key={r.fullName} value={r.fullName} disabled={same || readOnly}>
                {r.fullName}{readOnly ? " · read only" : ""}{same ? " · same as source" : ""}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      {error && <p className="text-xs text-destructive sm:col-start-2 sm:col-span-2">{error}</p>}
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: readonly { value: T; label: string; icon: React.ElementType }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid h-10 grid-cols-2 rounded-md border border-input bg-background p-1">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex items-center justify-center gap-1.5 rounded text-sm transition-colors ${value === o.value ? "bg-secondary font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <o.icon className="h-3.5 w-3.5" />{o.label}
        </button>
      ))}
    </div>
  );
}

function BranchPicker({ all, selected, options, loading, error, disabled, onAll, onToggle }: {
  all: boolean; selected: string[]; options: string[]; loading: boolean; error: string | null; disabled: boolean;
  onAll: (v: boolean) => void; onToggle: (b: string) => void;
}) {
  const summary = all ? "All branches" : selected.length ? (selected.length <= 2 ? selected.join(", ") : `${selected.slice(0, 2).join(", ")} +${selected.length - 2}`) : "Choose branches";
  const item = "flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-secondary";
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={triggerClass} disabled={disabled} aria-label="Branches">
        <span className={`truncate ${!all && !selected.length ? "text-muted-foreground" : ""}`}>{summary}</span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={4} className="z-50 w-[var(--radix-dropdown-menu-trigger-width)] rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          <DropdownMenu.CheckboxItem checked={all} onCheckedChange={v => onAll(!!v)} onSelect={e => e.preventDefault()} className={item}>
            <span className="flex h-4 w-4 items-center justify-center"><DropdownMenu.ItemIndicator><Check className="h-4 w-4" /></DropdownMenu.ItemIndicator></span>
            All branches
          </DropdownMenu.CheckboxItem>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <div className="max-h-56 overflow-y-auto">
            {loading && <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading branches…</div>}
            {error && <p className="px-2 py-1.5 text-xs text-destructive">{error}</p>}
            {options.map(b => (
              <DropdownMenu.CheckboxItem key={b} checked={!all && selected.includes(b)} onCheckedChange={() => onToggle(b)} onSelect={e => e.preventDefault()} className={item}>
                <span className="flex h-4 w-4 items-center justify-center"><DropdownMenu.ItemIndicator><Check className="h-4 w-4" /></DropdownMenu.ItemIndicator></span>
                <span className="truncate">{b}</span>
              </DropdownMenu.CheckboxItem>
            ))}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function OptionRow({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
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
          <DialogContent className="max-w-lg sm:max-w-2xl max-h-[90dvh] overflow-y-auto sm:max-h-none sm:overflow-visible" onOpenAutoFocus={e => e.preventDefault()}>
            <DialogHeader><DialogTitle>{form.id ? "Edit synchronization" : "New synchronization"}</DialogTitle></DialogHeader>
            <div className="flex flex-col gap-6">
              <section className="flex flex-col gap-3">
                <h3 className={sectionTitle}>Setup</h3>
                <RepoRow
                  label="Source"
                  accounts={accounts}
                  connectionId={form.sourceConnectionId}
                  repo={form.sourceRepo}
                  list={repoLists[form.sourceConnectionId]}
                  needsPush={form.direction === "two_way"}
                  onAccount={v => update({ sourceConnectionId: v, sourceRepo: "", branches: [] })}
                  onRepo={v => update({ sourceRepo: v, branches: [] })}
                />
                <RepoRow
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
                <div className={rowGrid}>
                  <Label className="text-sm text-muted-foreground">Direction</Label>
                  <Segmented
                    label="Direction"
                    value={form.direction}
                    onChange={v => update({ direction: v })}
                    options={[
                      { value: "one_way", label: "One-way", icon: ArrowRight },
                      { value: "two_way", label: "Two-way", icon: ArrowLeftRight },
                    ] as const}
                  />
                </div>
                <div className={rowGrid}>
                  <Label className="text-sm text-muted-foreground">Frequency</Label>
                  <Select value={form.intervalMinutes} onValueChange={v => setForm(f => ({ ...f, intervalMinutes: v }))}>
                    <SelectTrigger aria-label="Frequency"><SelectValue /></SelectTrigger>
                    <SelectContent>{intervalOptions.map(m => <SelectItem key={m} value={String(m)}>{intervalLabel(m)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className={rowGrid}>
                  <Label className="text-sm text-muted-foreground">Branches</Label>
                  <BranchPicker
                    all={form.allBranches}
                    selected={form.branches}
                    options={branchChoices}
                    loading={!!form.sourceRepo && branchOptions === null}
                    error={branchError}
                    disabled={!form.sourceRepo}
                    onAll={v => setForm(f => ({ ...f, allBranches: v }))}
                    onToggle={b => setForm(f => ({ ...f, allBranches: false, branches: f.branches.includes(b) ? f.branches.filter(x => x !== b) : [...f.branches, b] }))}
                  />
                </div>
              </section>

              <section className="flex flex-col gap-3">
                <h3 className={sectionTitle}>Options</h3>
                <div className="divide-y rounded-lg border">
                  <OptionRow title="Tags" description="Copy tags along with branches" checked={form.syncTags} onChange={v => setForm(f => ({ ...f, syncTags: v }))} />
                  <OptionRow
                    title="Mirror deletions"
                    description={form.direction === "one_way" ? "Remove branches and tags deleted from the source" : "Remove branches and tags deleted on either side"}
                    checked={form.propagateDeletes}
                    onChange={v => setForm(f => ({ ...f, propagateDeletes: v }))}
                  />
                  {form.direction === "one_way" && (
                    <OptionRow title="Overwrite destination" description="Replace commits made directly in the destination" checked={form.forcePush} onChange={v => setForm(f => ({ ...f, forcePush: v }))} />
                  )}
                </div>
              </section>
            </div>
            <DialogFooter className="flex-row items-center sm:justify-between">
              <label className="mr-auto flex cursor-pointer items-center gap-2 text-sm">
                <Switch checked={form.enabled} onCheckedChange={v => setForm(f => ({ ...f, enabled: v }))} />
                Enabled
              </label>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving || !formValid}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                </Button>
              </div>
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
