import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { count, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { github_connections, repositories } from "@/lib/db/schema";
import { encrypt } from "@/lib/encryption";
import { verifyToken } from "@/lib/github";
import { logAudit } from "@/lib/audit";

const createSchema = z.object({
  name: z.string().trim().min(1).max(255),
  username: z.string().trim().max(39).optional().default(""),
  token: z.string().trim().min(1).max(1000),
});
const updateSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1).max(255),
  username: z.string().trim().max(39).optional().default(""),
  token: z.string().trim().max(1000).optional().default(""),
});

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
}

async function checkToken(token: string, username: string) {
  const v = await verifyToken(token);
  if (!v.ok) return { error: v.error };
  if (username && username.toLowerCase() !== v.login.toLowerCase()) return { error: `Token belongs to "${v.login}", not "${username}"` };
  return { login: v.login };
}

export async function GET() {
  await requireAdmin();
  const [list, usage] = await Promise.all([
    db.select({ id: github_connections.id, name: github_connections.name, username: github_connections.username, createdAt: github_connections.createdAt })
      .from(github_connections).orderBy(github_connections.name),
    db.select({ connectionId: repositories.connectionId, n: count() }).from(repositories).groupBy(repositories.connectionId),
  ]);
  const used = new Map(usage.map(u => [u.connectionId, Number(u.n)]));
  return NextResponse.json({ connections: list.map(c => ({ ...c, repoCount: used.get(c.id) ?? 0 })) });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { name, username, token } = parsed.data;
  const check = await checkToken(token, username);
  if ("error" in check) return NextResponse.json({ error: check.error }, { status: 400 });
  await db.insert(github_connections).values({ name, username: check.login, token: encrypt(token) });
  await logAudit({ userEmail: admin.email, action: "create", resource: "github_connection", detail: `name=${name}; username=${check.login}`, ip: clientIp(req) });
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const admin = await requireAdmin();
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { id, name, username, token } = parsed.data;
  const [existing] = await db.select({ name: github_connections.name, username: github_connections.username })
    .from(github_connections).where(eq(github_connections.id, id)).limit(1);
  if (!existing) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const changes = [`id=${id}`];
  if (name !== existing.name) changes.push(`name: ${existing.name}→${name}`);
  if (token) {
    const check = await checkToken(token, username);
    if ("error" in check) return NextResponse.json({ error: check.error }, { status: 400 });
    await db.update(github_connections).set({ name, username: check.login, token: encrypt(token) }).where(eq(github_connections.id, id));
    changes.push("token replaced");
    if (check.login !== existing.username) changes.push(`username: ${existing.username}→${check.login}`);
  } else {
    await db.update(github_connections).set({ name }).where(eq(github_connections.id, id));
  }
  await logAudit({ userEmail: admin.email, action: "update", resource: "github_connection", detail: changes.join("; "), ip: clientIp(req) });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const [{ n }] = await db.select({ n: count() }).from(repositories).where(eq(repositories.connectionId, id));
  if (Number(n)) return NextResponse.json({ error: `Used by ${n} repositor${Number(n) === 1 ? "y" : "ies"} — remove ${Number(n) === 1 ? "it" : "them"} first` }, { status: 409 });
  const [existing] = await db.select({ name: github_connections.name, username: github_connections.username })
    .from(github_connections).where(eq(github_connections.id, id)).limit(1);
  await db.delete(github_connections).where(eq(github_connections.id, id));
  await logAudit({ userEmail: admin.email, action: "delete", resource: "github_connection", detail: `id=${id}${existing ? `; name=${existing.name}; username=${existing.username}` : ""}`, ip: clientIp(req) });
  return NextResponse.json({ ok: true });
}
