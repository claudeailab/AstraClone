import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { sync_runs } from "@/lib/db/schema";
import type { RefChange } from "@/lib/sync-shared";
import { parseVerification } from "@/lib/sync-engine";

export async function GET(req: NextRequest) {
  if (!(await getUser())?.role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const rows = await db.select().from(sync_runs).where(eq(sync_runs.syncId, id)).orderBy(desc(sync_runs.id)).limit(50);
  const runs = rows.map(r => {
    let changes: RefChange[] = [];
    try { changes = r.changes ? JSON.parse(r.changes) : []; } catch { changes = []; }
    return { ...r, changes, verification: parseVerification(r.verification) };
  });
  return NextResponse.json({ runs });
}
