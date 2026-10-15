import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { github_connections } from "@/lib/db/schema";
import { decrypt } from "@/lib/encryption";
import { listBranches, parseRepoRef } from "@/lib/github";

export async function GET(req: NextRequest) {
  await requireAdmin();
  const params = new URL(req.url).searchParams;
  const id = Number(params.get("id"));
  const ref = parseRepoRef(params.get("repo") ?? "");
  if (!id || !ref) return NextResponse.json({ error: "Missing account or repository" }, { status: 400 });
  const [conn] = await db.select({ token: github_connections.token }).from(github_connections).where(eq(github_connections.id, id)).limit(1);
  if (!conn) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  let token: string;
  try { token = decrypt(conn.token); } catch { return NextResponse.json({ error: "Stored token cannot be decrypted — re-enter it" }, { status: 400 }); }
  const result = await listBranches(token, ref.owner, ref.name);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ branches: result.branches });
}
