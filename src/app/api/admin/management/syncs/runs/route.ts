import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { sync_runs } from "@/lib/db/schema";

export async function GET(req: NextRequest) {
  await requireAdmin();
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const runs = await db.select().from(sync_runs).where(eq(sync_runs.syncId, id)).orderBy(desc(sync_runs.id)).limit(50);
  return NextResponse.json({ runs });
}
