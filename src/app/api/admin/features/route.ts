import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/encryption";
import { FEATURE_KEYS } from "@/lib/features";
import { logAudit } from "@/lib/audit";

export async function GET() {
  await requireAdmin();
  const values = await Promise.all(FEATURE_KEYS.map(k => getSetting(`feature_${k}`)));
  const features = Object.fromEntries(FEATURE_KEYS.map((k, i) => [k, values[i] === "true"]));
  return NextResponse.json({ features });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => null) as Record<string, boolean> | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const changes: string[] = [];
  for (const k of FEATURE_KEYS) {
    if (typeof body[k] === "boolean") {
      const prev = await getSetting(`feature_${k}`);
      const prevBool = prev === "true";
      if (prevBool !== body[k]) {
        await setSetting(`feature_${k}`, body[k] ? "true" : "false");
        changes.push(`${k}: ${prevBool}→${body[k]}`);
      }
    }
  }

  if (changes.length > 0) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    await logAudit({ userEmail: admin.email, action: "update", resource: "features", detail: changes.join("; "), ip });
  }

  return NextResponse.json({ ok: true });
}
