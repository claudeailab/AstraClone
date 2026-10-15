import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { github_connections } from "@/lib/db/schema";
import { decrypt } from "@/lib/encryption";
import { verifyToken } from "@/lib/github";

export async function POST(req: NextRequest) {
  await requireAdmin();
  const parsed = z.object({ id: z.number().int().positive() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const [row] = await db.select({ token: github_connections.token }).from(github_connections).where(eq(github_connections.id, parsed.data.id)).limit(1);
  if (!row) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  let token: string;
  try { token = decrypt(row.token); } catch { return NextResponse.json({ error: "Stored token cannot be decrypted — re-enter it" }, { status: 400 }); }
  const v = await verifyToken(token);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  return NextResponse.json({ ok: true, login: v.login, scopes: v.scopes });
}
