import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { syncs } from "@/lib/db/schema";
import { describeRoute, isSyncBusy, verifySync } from "@/lib/sync-engine";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const parsed = z.object({ id: z.number().int().positive() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { id } = parsed.data;
  const [row] = await db.select({ src: syncs.sourceRepoId, dst: syncs.destRepoId, direction: syncs.direction }).from(syncs).where(eq(syncs.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: "Synchronization not found" }, { status: 404 });
  if (isSyncBusy(id)) return NextResponse.json({ error: "Already running" }, { status: 409 });
  void verifySync(id);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  await logAudit({ userEmail: admin.email, action: "verify", resource: "sync", detail: `id=${id}; route=${await describeRoute(row.src, row.dst, row.direction)}`, ip });
  return NextResponse.json({ ok: true });
}
