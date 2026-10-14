import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { syncs } from "@/lib/db/schema";
import { isSyncRunning, runSync } from "@/lib/sync-engine";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const parsed = z.object({ id: z.number().int().positive() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { id } = parsed.data;
  const [row] = await db.select({ name: syncs.name }).from(syncs).where(eq(syncs.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: "Synchronization not found" }, { status: 404 });
  if (isSyncRunning(id)) return NextResponse.json({ error: "Already running" }, { status: 409 });
  void runSync(id, "manual");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  await logAudit({ userEmail: admin.email, action: "run", resource: "sync", detail: `id=${id}; name=${row.name}`, ip });
  return NextResponse.json({ ok: true });
}
