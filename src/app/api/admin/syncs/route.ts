import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, ne } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { syncs } from "@/lib/db/schema";
import { describeRoute, listSyncOverview, pruneUnusedRepositories, removeSyncWorkdirs, resolveRepository, sameRepository } from "@/lib/sync-engine";
import { logAudit } from "@/lib/audit";

const syncSchema = z.object({
  sourceConnectionId: z.number().int().positive(),
  sourceRepo: z.string().trim().min(3).max(201),
  destConnectionId: z.number().int().positive(),
  destRepo: z.string().trim().min(3).max(201),
  direction: z.enum(["one_way", "two_way"]),
  branches: z.string().trim().max(1000).regex(/^[A-Za-z0-9._/*,\s-]*$/, "Branches may only contain names, * wildcards and commas"),
  syncTags: z.boolean(),
  forcePush: z.boolean(),
  mode: z.enum(["full", "changes"]),
  propagateDeletes: z.boolean(),
  intervalMinutes: z.number().int().min(1).max(1440),
  enabled: z.boolean(),
});
const updateSchema = z.intersection(syncSchema, z.object({ id: z.number().int().positive() }));

type SyncInput = z.infer<typeof syncSchema>;

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
}

function firstIssue(err: z.ZodError) {
  return err.issues.find(i => i.code === "custom" || i.code === "invalid_format")?.message ?? "Invalid input";
}

/** Verifies both repositories on GitHub and returns the values to store, or an error. */
async function prepare(s: SyncInput, excludeId?: number) {
  const [src, dst] = await Promise.all([
    resolveRepository(s.sourceConnectionId, s.sourceRepo),
    resolveRepository(s.destConnectionId, s.destRepo),
  ]);
  if ("error" in src) return { error: `Source: ${src.error}` };
  if ("error" in dst) return { error: `Destination: ${dst.error}` };
  if (sameRepository(src, dst)) return { error: "Source and destination are the same GitHub repository" };
  if (!dst.canPush) return { error: `The destination account has no push access to ${dst.owner}/${dst.name}` };
  if (s.direction === "two_way" && !src.canPush) return { error: `Two-way sync needs push access to ${src.owner}/${src.name}` };
  const dupe = await db.select({ id: syncs.id }).from(syncs).where(and(
    eq(syncs.sourceRepoId, src.id), eq(syncs.destRepoId, dst.id),
    ...(excludeId ? [ne(syncs.id, excludeId)] : []),
  )).limit(1);
  if (dupe.length) return { error: "A synchronization between these repositories already exists" };
  return {
    values: {
      sourceRepoId: src.id,
      destRepoId: dst.id,
      direction: s.direction,
      branches: s.branches.split(",").map(b => b.trim()).filter(Boolean).join(", "),
      syncTags: s.syncTags,
      forcePush: s.direction === "one_way" && s.forcePush,
      mode: s.mode,
      propagateDeletes: s.propagateDeletes,
      intervalMinutes: s.intervalMinutes,
      enabled: s.enabled,
    },
  };
}

type SyncValues = NonNullable<Awaited<ReturnType<typeof prepare>>["values"]>;

async function describe(v: SyncValues) {
  return `route=${await describeRoute(v.sourceRepoId, v.destRepoId, v.direction)}; branches=${v.branches || "all"}; tags=${v.syncTags}; force=${v.forcePush}; mode=${v.mode}; deletes=${v.propagateDeletes}; every=${v.intervalMinutes}m; enabled=${v.enabled}`;
}

export async function GET() {
  await requireAdmin();
  return NextResponse.json({ syncs: await listSyncOverview() });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const parsed = syncSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  const r = await prepare(parsed.data);
  if ("error" in r) { await pruneUnusedRepositories(); return NextResponse.json({ error: r.error }, { status: 400 }); }
  await db.insert(syncs).values(r.values);
  await logAudit({ userEmail: admin.email, action: "create", resource: "sync", detail: await describe(r.values), ip: clientIp(req) });
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const admin = await requireAdmin();
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  const { id, ...data } = parsed.data;
  const [existing] = await db.select().from(syncs).where(eq(syncs.id, id)).limit(1);
  if (!existing) return NextResponse.json({ error: "Synchronization not found" }, { status: 404 });
  const r = await prepare(data, id);
  if ("error" in r) { await pruneUnusedRepositories(); return NextResponse.json({ error: r.error }, { status: 400 }); }
  // The remembered ref state only applies to the same route and scope; start fresh when they change.
  const scopeChanged = (["sourceRepoId", "destRepoId", "direction", "branches", "syncTags", "mode"] as const).some(k => existing[k] !== r.values[k]);
  await db.update(syncs).set({ ...r.values, ...(scopeChanged ? { refState: null } : {}) }).where(eq(syncs.id, id));
  await pruneUnusedRepositories();
  await logAudit({ userEmail: admin.email, action: "update", resource: "sync", detail: `id=${id}; ${await describe(r.values)}`, ip: clientIp(req) });
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
  await pruneUnusedRepositories();
  await logAudit({ userEmail: admin.email, action: "delete", resource: "sync", detail: `id=${id}${route ? `; route=${route}` : ""}`, ip: clientIp(req) });
  return NextResponse.json({ ok: true });
}
