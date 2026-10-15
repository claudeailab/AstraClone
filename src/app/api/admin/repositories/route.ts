import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, count, eq, ne, or } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { github_connections, repositories, syncs } from "@/lib/db/schema";
import { decrypt } from "@/lib/encryption";
import { inspectRepo, parseRepoRef } from "@/lib/github";
import { logAudit } from "@/lib/audit";

const createSchema = z.object({ connectionId: z.number().int().positive(), repo: z.string().trim().min(3).max(300) });
const updateSchema = createSchema.extend({ id: z.number().int().positive() });

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
}

async function resolve(connectionId: number, repo: string, excludeId?: number) {
  const ref = parseRepoRef(repo);
  if (!ref) return { error: "Enter the repository as owner/name or a github.com URL" };
  const [conn] = await db.select({ token: github_connections.token }).from(github_connections).where(eq(github_connections.id, connectionId)).limit(1);
  if (!conn) return { error: "GitHub account not found" };
  const dupe = await db.select({ id: repositories.id }).from(repositories).where(and(
    eq(repositories.connectionId, connectionId), eq(repositories.owner, ref.owner), eq(repositories.name, ref.name),
    ...(excludeId ? [ne(repositories.id, excludeId)] : []),
  )).limit(1);
  if (dupe.length) return { error: `${ref.owner}/${ref.name} is already added for this account` };
  let token: string;
  try { token = decrypt(conn.token); } catch { return { error: "Account token cannot be decrypted — re-enter it" }; }
  const info = await inspectRepo(token, ref.owner, ref.name);
  if (!info.ok) return { error: info.error };
  return { values: { connectionId, owner: ref.owner, name: ref.name, githubId: info.githubId, isPrivate: info.isPrivate, canPush: info.canPush, defaultBranch: info.defaultBranch } };
}

export async function GET() {
  await requireAdmin();
  const list = await db.select({
    id: repositories.id, connectionId: repositories.connectionId, owner: repositories.owner, name: repositories.name,
    githubId: repositories.githubId, isPrivate: repositories.isPrivate, canPush: repositories.canPush, defaultBranch: repositories.defaultBranch,
    connectionName: github_connections.name, connectionUsername: github_connections.username,
  }).from(repositories).innerJoin(github_connections, eq(repositories.connectionId, github_connections.id))
    .orderBy(repositories.owner, repositories.name);
  const usage = await db.select({ src: syncs.sourceRepoId, dst: syncs.destRepoId }).from(syncs);
  return NextResponse.json({
    repositories: list.map(r => ({ ...r, syncCount: usage.filter(u => u.src === r.id || u.dst === r.id).length })),
  });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const r = await resolve(parsed.data.connectionId, parsed.data.repo);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  await db.insert(repositories).values(r.values);
  await logAudit({ userEmail: admin.email, action: "create", resource: "repository", detail: `repo=${r.values.owner}/${r.values.name}; push=${r.values.canPush}`, ip: clientIp(req) });
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const admin = await requireAdmin();
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { id, connectionId, repo } = parsed.data;
  const [existing] = await db.select({ owner: repositories.owner, name: repositories.name }).from(repositories).where(eq(repositories.id, id)).limit(1);
  if (!existing) return NextResponse.json({ error: "Repository not found" }, { status: 404 });
  const r = await resolve(connectionId, repo, id);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  await db.update(repositories).set(r.values).where(eq(repositories.id, id));
  const before = `${existing.owner}/${existing.name}`, after = `${r.values.owner}/${r.values.name}`;
  await logAudit({ userEmail: admin.email, action: "update", resource: "repository", detail: `id=${id}; repo=${before === after ? after : `${before}→${after}`}; push=${r.values.canPush}`, ip: clientIp(req) });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const [{ n }] = await db.select({ n: count() }).from(syncs).where(or(eq(syncs.sourceRepoId, id), eq(syncs.destRepoId, id)));
  if (Number(n)) return NextResponse.json({ error: `Used by ${n} synchronization${Number(n) === 1 ? "" : "s"} — remove ${Number(n) === 1 ? "it" : "them"} first` }, { status: 409 });
  const [existing] = await db.select({ owner: repositories.owner, name: repositories.name }).from(repositories).where(eq(repositories.id, id)).limit(1);
  await db.delete(repositories).where(eq(repositories.id, id));
  await logAudit({ userEmail: admin.email, action: "delete", resource: "repository", detail: `id=${id}${existing ? `; repo=${existing.owner}/${existing.name}` : ""}`, ip: clientIp(req) });
  return NextResponse.json({ ok: true });
}
