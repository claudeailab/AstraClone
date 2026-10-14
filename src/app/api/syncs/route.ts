import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { listSyncOverview } from "@/lib/sync-engine";

export async function GET() {
  if (!await getUser()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ syncs: await listSyncOverview() });
}
