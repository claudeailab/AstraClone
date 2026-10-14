"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Pencil, Trash2, Lock, Globe, GitBranch, Upload, Eye } from "lucide-react";
import { pageWrapper, pageInner, pageTitle, muted } from "@/lib/ui-conventions";

interface Account { id: number; name: string; username: string }
interface Repo {
  id: number; connectionId: number; owner: string; name: string; isPrivate: boolean; canPush: boolean;
  defaultBranch: string | null; connectionName: string; connectionUsername: string; syncCount: number;
}

const emptyForm = { id: 0, connectionId: "", repo: "" };

export default function RepositoriesPage() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Repo | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [rr, ar] = await Promise.all([fetch("/api/admin/management/repositories"), fetch("/api/admin/management/connections")]);
      const [rd, ad] = await Promise.all([rr.json(), ar.json()]);
      setRepos(rd.repositories ?? []);
      setAccounts(ad.connections ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openNew() {
    setForm({ ...emptyForm, connectionId: accounts.length === 1 ? String(accounts[0].id) : "" });
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const body = { connectionId: Number(form.connectionId), repo: form.repo, ...(form.id ? { id: form.id } : {}) };
      const r = await fetch("/api/admin/management/repositories", {
        method: form.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Save failed"); return; }
      toast.success(form.id ? "Repository updated" : "Repository added");
      setDialogOpen(false);
      load();
    } finally { setSaving(false); }
  }

  async function handleDelete(repo: Repo) {
    const r = await fetch(`/api/admin/management/repositories?id=${repo.id}`, { method: "DELETE" });
    const d = await r.json();
    if (!r.ok) { toast.error(d.error ?? "Delete failed"); return; }
    toast.success("Repository removed");
    setDeleteTarget(null);
    load();
  }

  return (
    <div className={pageWrapper}>
      <div className={pageInner}>
        <div className="flex items-center justify-between gap-4 mb-2">
          <h1 className={pageTitle}>Repositories</h1>
          <Button size="sm" onClick={openNew} disabled={!accounts.length}><Plus className="h-4 w-4 mr-1" /> Add Repository</Button>
        </div>
        <p className={`${muted} mb-6`}>Repositories available as a source or destination. Access is verified with the selected account when saving.</p>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : !accounts.length ? (
          <p className={`text-center py-12 ${muted}`}>
            Add a <Link href="/admin/management/accounts" className="text-primary underline-offset-4 hover:underline">GitHub account</Link> first.
          </p>
        ) : repos.length === 0 ? (
          <p className={`text-center py-12 ${muted}`}>No repositories yet.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {repos.map(r => (
              <Card key={r.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base font-mono truncate">
                      <a href={`https://github.com/${r.owner}/${r.name}`} target="_blank" rel="noopener noreferrer" className="hover:underline underline-offset-4">{r.owner}/{r.name}</a>
                    </CardTitle>
                    <p className="text-sm text-muted-foreground truncate">via {r.connectionName} (@{r.connectionUsername})</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" aria-label="Edit" onClick={() => { setForm({ id: r.id, connectionId: String(r.connectionId), repo: `${r.owner}/${r.name}` }); setDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => setDeleteTarget(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="secondary" className="gap-1">{r.isPrivate ? <Lock className="h-3 w-3" /> : <Globe className="h-3 w-3" />}{r.isPrivate ? "Private" : "Public"}</Badge>
                    <Badge variant="secondary" className="gap-1">{r.canPush ? <Upload className="h-3 w-3" /> : <Eye className="h-3 w-3" />}{r.canPush ? "Push access" : "Read only"}</Badge>
                    {r.defaultBranch && <Badge variant="outline" className="gap-1 font-mono"><GitBranch className="h-3 w-3" />{r.defaultBranch}</Badge>}
                  </div>
                  <span className={muted}>Used by {r.syncCount} synchronization{r.syncCount === 1 ? "" : "s"}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{form.id ? "Edit Repository" : "Add Repository"}</DialogTitle></DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>GitHub account</Label>
                <Select value={form.connectionId} onValueChange={v => setForm(f => ({ ...f, connectionId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select an account" /></SelectTrigger>
                  <SelectContent>
                    {accounts.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name} (@{a.username})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Repository</Label>
                <Input value={form.repo} onChange={e => setForm(f => ({ ...f, repo: e.target.value }))} placeholder="owner/name or https://github.com/owner/name" className="font-mono" autoComplete="off" />
                {form.id ? <p className="text-xs text-muted-foreground">Saving re-checks access and refreshes the details.</p> : null}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !form.connectionId || !form.repo.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={deleteTarget !== null} onOpenChange={() => setDeleteTarget(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Remove Repository</DialogTitle></DialogHeader>
            <p className="text-sm">Remove <span className="font-mono font-medium">{deleteTarget?.owner}/{deleteTarget?.name}</span> from the platform? The repository on GitHub is not affected.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => deleteTarget && handleDelete(deleteTarget)}>Remove</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
