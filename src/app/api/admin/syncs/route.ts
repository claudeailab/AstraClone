import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, inArray, ne } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { repositories, syncs } from "@/lib/db/schema";
import { describeRoute, listSyncOverview, removeSyncWorkdirs, sameRepository } from "@/lib/sync-engine";
import { logAudit } from "@/lib/audit";

const syncSchema = z.object({
  sourceRepoId: z.number().int().positive(),
  destRepoId: z.number().int().positive(),
  direction: z.enum(["one_way", "two_way"]),
  branches: z.string().trim().max(1000).regex(/^[A-Za-z0-9._/*,\s-]*$/, "Branches may only contain names, * wildcards and commas"),
  syncTags: z.boolean(),
  forcePush: z.boolean(),
  mode: z.enum(["full", "changes"]),
  propagateDeletes: z.boolean(),
  intervalMinutes: z.number().int().min(1).max(1440),
  enabled: z.boolean(),
}).refine(s => s.sourceRepoId !== s.destRepoId, { message: "Source and destination must be different repositories" });
const updateSchema = z.intersection(syncSchema, z.object({ id: z.number().int().positive() }));

type SyncInput = z.infer<typeof syncSchema>;

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
}

async function validateRepos(s: SyncInput, excludeId?: number): Promise<string | null> {
  const dupe = await db.select({ id: syncs.id }).from(syncs).where(and(
    eq(syncs.sourceRepoId, s.sourceRepoId), eq(syncs.destRepoId, s.destRepoId),
    ...(excludeId ? [ne(syncs.id, excludeId)] : []),
  )).limit(1);
  if (dupe.length) return "A synchronization between these repositories already exists";
  const rows = await db.select({ id: repositories.id, owner: repositories.owner, name: repositories.name, githubId: repositories.githubId, canPush: repositories.canPush })
    .from(repositories).where(inArray(repositories.id, [s.sourceRepoId, s.destRepoId]));
  const src = rows.find(r => r.id === s.sourceRepoId);
  const dst = rows.find(r => r.id === s.destRepoId);
  if (!src || !dst) return "Repository not found";
  if (sameRepository(src, dst)) return "Source and destination are the same GitHub repository";
  if (!dst.canPush) return `The account for ${dst.owner}/${dst.name} has no push access`;
  if (s.direction === "two_way" && !src.canPush) return `Two-way sync needs push access to ${src.owner}/${src.name}`;
  return null;
}

function values(s: SyncInput) {
  const branches = s.branches.split(",").map(b => b.trim()).filter(Boolean).join(", ");
  return { ...s, branches, forcePush: s.direction === "one_way" && s.forcePush };
}

async function describe(s: SyncInput) {
  return `route=${await describeRoute(s.sourceRepoId, s.destRepoId, s.direction)}; direction=${s.direction}; branches=${s.branches || "all"}; tags=${s.syncTags}; force=${s.direction === "one_way" && s.forcePush}; mode=${s.mode}; deletes=${s.propagateDeletes}; every=${s.intervalMinutes}m; enabled=${s.enabled}`;
}

function firstIssue(err: z.ZodError) {
  return err.issues.find(i => i.code === "custom" || i.code === "invalid_format")?.message ?? "Invalid input";
}

export async function GET() {
  await requireAdmin();
  return NextResponse.json({ syncs: await listSyncOverview() });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const parsed = syncSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  const problem = await validateRepos(parsed.data);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  await db.insert(syncs).values(values(parsed.data));
  await logAudit({ userEmail: admin.email, action: "create", resource: "sync", detail: await describe(parsed.data), ip: clientIp(req) });
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const admin = await requireAdmin();
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  const { id, ...data } = parsed.data;
  const [existing] = await db.select().from(syncs).where(eq(syncs.id, id)).limit(1);
  if (!existing) return NextResponse.json({ error: "Synchronization not found" }, { status: 404 });
  const problem = await validateRepos(data, id);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const next = values(data);
  // The remembered ref state only applies to the same route and scope; start fresh when they change.
  const scopeChanged = (["sourceRepoId", "destRepoId", "direction", "branches", "syncTags", "mode"] as const).some(k => existing[k] !== next[k]);
  await db.update(syncs).set({ ...next, ...(scopeChanged ? { refState: null } : {}) }).where(eq(syncs.id, id));
  await logAudit({ userEmail: admin.email, action: "update", resource: "sync", detail: `id=${id}; ${await describe(data)}`, ip: clientIp(req) });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const [existing] = await db.select({ src: syncs.sourceRepoId, dst: syncs.destRepoId, direction: syncs.direction }).from(syncs).where(eq(syncs.id, id)).limit(1);
  const route = existing ? await describeRoute(existing.src, existing.dst, existing.direction) : null;
  await db.delete(syncs).where(eq(syncs.id, id));
  await removeSyncWorkdirs([id]);
  await logAudit({ userEmail: admin.email, action: "delete", resource: "sync", detail: `id=${id}${route ? `; route=${route}` : ""}`, ip: clientIp(req) });
  return NextResponse.json({ ok: true });
}
