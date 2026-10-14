"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Plus, Pencil, Trash2, KeyRound, Plug } from "lucide-react";
import { pageWrapper, pageInner, pageTitle, muted } from "@/lib/ui-conventions";

interface Account { id: number; name: string; username: string; repoCount: number }

const emptyForm = { id: 0, name: "", username: "", token: "" };

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/management/connections");
      const d = await r.json();
      setAccounts(d.connections ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    setSaving(true);
    try {
      const r = await fetch("/api/admin/management/connections", {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form.id ? form : { name: form.name, username: form.username, token: form.token }),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Save failed"); return; }
      toast.success(form.id ? "Account updated" : "Account added");
      setDialogOpen(false);
      load();
    } finally { setSaving(false); }
  }

  async function handleTest(a: Account) {
    setTesting(a.id);
    try {
      const r = await fetch("/api/admin/management/connections/test", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: a.id }),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Test failed"); return; }
      toast.success(`Connected as ${d.login}${d.scopes ? ` · scopes: ${d.scopes}` : ""}`);
    } finally { setTesting(null); }
  }

  async function handleDelete(a: Account) {
    const r = await fetch(`/api/admin/management/connections?id=${a.id}`, { method: "DELETE" });
    const d = await r.json();
    if (!r.ok) { toast.error(d.error ?? "Delete failed"); return; }
    toast.success("Account removed");
    setDeleteTarget(null);
    load();
  }

  return (
    <div className={pageWrapper}>
      <div className={pageInner}>
        <div className="flex items-center justify-between gap-4 mb-2">
          <h1 className={pageTitle}>GitHub Accounts</h1>
          <Button size="sm" onClick={() => { setForm(emptyForm); setDialogOpen(true); }}><Plus className="h-4 w-4 mr-1" /> Add Account</Button>
        </div>
        <p className={`${muted} mb-6`}>Personal access tokens used to read from and push to your repositories. Tokens are stored encrypted.</p>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : accounts.length === 0 ? (
          <p className={`text-center py-12 ${muted}`}>No GitHub accounts yet. Add one to get started.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {accounts.map(a => (
              <Card key={a.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base truncate">{a.name}</CardTitle>
                    <p className="text-sm text-muted-foreground truncate">@{a.username}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" aria-label="Edit" onClick={() => { setForm({ id: a.id, name: a.name, username: a.username, token: "" }); setDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => setDeleteTarget(a)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-2">
                  <span className={muted}>{a.repoCount} repositor{a.repoCount === 1 ? "y" : "ies"}</span>
                  <Button size="sm" variant="outline" onClick={() => handleTest(a)} disabled={testing === a.id}>
                    {testing === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plug className="h-4 w-4 mr-1" /> Test</>}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{form.id ? "Edit Account" : "Add GitHub Account"}</DialogTitle></DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Name</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Company org bot" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>GitHub username <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="Detected from the token" autoComplete="off" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="flex items-center gap-1.5"><KeyRound className="h-3.5 w-3.5" /> Personal access token</Label>
                <Input type="password" value={form.token} onChange={e => setForm(f => ({ ...f, token: e.target.value }))} placeholder={form.id ? "Leave blank to keep the current token" : "ghp_… or github_pat_…"} autoComplete="new-password" />
                <p className="text-xs text-muted-foreground">Needs <span className="font-mono">repo</span> scope (classic) or Contents read/write (fine-grained). Add <span className="font-mono">workflow</span> scope if synced branches change GitHub Actions files.</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !form.name.trim() || (!form.id && !form.token.trim())}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={deleteTarget !== null} onOpenChange={() => setDeleteTarget(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Remove Account</DialogTitle></DialogHeader>
            <p className="text-sm">Remove <span className="font-medium">{deleteTarget?.name}</span> and its stored token?</p>
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
