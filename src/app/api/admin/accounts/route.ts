import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { github_connections, repositories, syncs } from "@/lib/db/schema";
import { pruneUnusedRepositories } from "@/lib/sync-engine";
import { encrypt } from "@/lib/encryption";
import { verifyToken } from "@/lib/github";
import { logAudit } from "@/lib/audit";

const createSchema = z.object({
  name: z.string().trim().max(255).optional().default(""),
  token: z.string().trim().min(1).max(1000),
});
const updateSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1).max(255),
  token: z.string().trim().max(1000).optional().default(""),
});

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
}

async function checkToken(token: string) {
  const v = await verifyToken(token);
  if (!v.ok) return { error: v.error };
  return { login: v.login };
}

/** Number of synchronizations using each account (as source or destination). */
async function syncCounts() {
  const [repos, rows] = await Promise.all([
    db.select({ id: repositories.id, connectionId: repositories.connectionId }).from(repositories),
    db.select({ id: syncs.id, src: syncs.sourceRepoId, dst: syncs.destRepoId }).from(syncs),
  ]);
  const conn = new Map(repos.map(r => [r.id, r.connectionId]));
  const counts = new Map<number, number>();
  for (const sync of rows) {
    for (const c of new Set([conn.get(sync.src), conn.get(sync.dst)])) if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return counts;
}

export async function GET() {
  await requireAdmin();
  const [list, counts] = await Promise.all([
    db.select({ id: github_connections.id, name: github_connections.name, username: github_connections.username, createdAt: github_connections.createdAt })
      .from(github_connections).orderBy(github_connections.name),
    syncCounts(),
  ]);
  return NextResponse.json({ connections: list.map(c => ({ ...c, syncCount: counts.get(c.id) ?? 0 })) });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { token } = parsed.data;
  const check = await checkToken(token);
  if ("error" in check) return NextResponse.json({ error: check.error }, { status: 400 });
  const name = parsed.data.name || check.login;
  await db.insert(github_connections).values({ name, username: check.login, token: encrypt(token) });
  await logAudit({ userEmail: admin.email, action: "create", resource: "github_connection", detail: `name=${name}; username=${check.login}`, ip: clientIp(req) });
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const admin = await requireAdmin();
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { id, name, token } = parsed.data;
  const [existing] = await db.select({ name: github_connections.name, username: github_connections.username })
    .from(github_connections).where(eq(github_connections.id, id)).limit(1);
  if (!existing) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const changes = [`id=${id}`];
  if (name !== existing.name) changes.push(`name: ${existing.name}→${name}`);
  if (token) {
    const check = await checkToken(token);
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
  const n = (await syncCounts()).get(id) ?? 0;
  if (n) return NextResponse.json({ error: `Used by ${n} synchronization${n === 1 ? "" : "s"} — remove ${n === 1 ? "it" : "them"} first` }, { status: 409 });
  await pruneUnusedRepositories();
  const [existing] = await db.select({ name: github_connections.name, username: github_connections.username })
    .from(github_connections).where(eq(github_connections.id, id)).limit(1);
  await db.delete(github_connections).where(eq(github_connections.id, id));
  await logAudit({ userEmail: admin.email, action: "delete", resource: "github_connection", detail: `id=${id}${existing ? `; name=${existing.name}; username=${existing.username}` : ""}`, ip: clientIp(req) });
  return NextResponse.json({ ok: true });
}
