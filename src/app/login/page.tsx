"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import Link from "next/link";
import { Loader2, AlertCircle, ArrowRight, ShieldCheck, User } from "lucide-react";

const ERROR_MESSAGES: Record<string, string> = {
  auth_failed: "Authentication failed. Please try again.",
  m365_not_configured: "Microsoft 365 is not configured on this platform.",
  token_failed: "Could not authenticate with Microsoft.",
  invalid_token: "Invalid authentication response.",
  not_provisioned: "Your account has not been added to this platform.",
  no_access: "Your account exists but has no permission group assigned. Ask an administrator to assign you to a group.",
  no_group: "Your account exists but has no permission group assigned. Ask an administrator to assign you to a group.",
};

function LoginForm({ platformName }: { platformName: string }) {
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  useEffect(() => {
    const error = searchParams.get("error");
    if (error) {
      const msg = ERROR_MESSAGES[error] ?? "Login failed";
      setErrorBanner(msg);
      toast.error(msg);
    }
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (data.azureLogin) {
        window.location.href = `/api/auth/azure?email=${encodeURIComponent(username)}`;
        return;
      }
      if (!res.ok) { toast.error(data.error ?? "Login failed"); return; }
      window.location.href = data.redirect ?? "/";
    } catch {
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {errorBanner && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{errorBanner}</span>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="username">Username</Label>
        <Input id="username" type="text" required value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
      </Button>
    </form>
  );
}

function LoginPageInner() {
  const [platformName, setPlatformName] = useState("Platform");
  const [iconUrl, setIconUrl] = useState("");
  const [sessions, setSessions] = useState<{ admin: { name: string } | null; user: { name: string } | null }>({ admin: null, user: null });

  useEffect(() => {
    fetch("/api/auth/sessions").then(r => r.json()).then(setSessions).catch(() => {});
  }, []);

  const active = [
    sessions.admin && { href: "/admin", label: "Administrator", name: sessions.admin.name, icon: ShieldCheck },
    sessions.user && { href: "/user", label: "User", name: sessions.user.name, icon: User },
  ].filter(Boolean) as { href: string; label: string; name: string; icon: React.ElementType }[];

  useEffect(() => {
    fetch("/api/platform").then(r => r.json()).then(d => {
      if (d.name) setPlatformName(d.name);
      if (d.iconUrl) setIconUrl(d.iconUrl);
    }).catch(() => {});
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          {iconUrl && (
            <div className="flex justify-center mb-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={iconUrl} alt="" className="h-10 w-10" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
            </div>
          )}
          <CardTitle className="text-2xl">{platformName}</CardTitle>
          <CardDescription>{active.length ? "Continue, or sign in with another account" : "Sign in to your account"}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {active.length > 0 && (
            <div className="flex flex-col gap-2">
              {active.map(s => (
                <Link key={s.href} href={s.href} className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors hover:bg-secondary">
                  <s.icon className="h-4 w-4 shrink-0 text-primary" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{s.name}</span>
                    <span className="text-xs text-muted-foreground">Signed in · {s.label}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              ))}
              <div className="flex items-center gap-3 pt-1 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />or sign in<span className="h-px flex-1 bg-border" />
              </div>
            </div>
          )}
          <Suspense fallback={<div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>}>
            <LoginForm platformName={platformName} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return <LoginPageInner />;
}
