import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { github_connections, repositories } from "@/lib/db/schema";
import { decrypt } from "@/lib/encryption";
import { listBranches } from "@/lib/github";

export async function GET(req: NextRequest) {
  await requireAdmin();
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const [row] = await db.select({ owner: repositories.owner, name: repositories.name, token: github_connections.token })
    .from(repositories).innerJoin(github_connections, eq(repositories.connectionId, github_connections.id))
    .where(eq(repositories.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: "Repository not found" }, { status: 404 });
  let token: string;
  try { token = decrypt(row.token); } catch { return NextResponse.json({ error: "Stored token cannot be decrypted — re-enter it" }, { status: 400 }); }
  const result = await listBranches(token, row.owner, row.name);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ branches: result.branches });
}
