import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getSetting, setSetting, getEnvOverride, getEnvVarName } from "@/lib/encryption";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  enabled: z.boolean(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  liveMode: z.boolean(),
});

export async function GET() {
  await requireAdmin();
  const [enabled, liveMode, clientId, clientSecret] = await Promise.all([
    getSetting("paypal_enabled"),
    getSetting("paypal_liveMode"),
    getSetting("paypal_clientId"),
    getSetting("paypal_clientSecret"),
  ]);
  const envLocked = (k: string) => { const v = getEnvOverride(k); return v !== undefined && v !== ""; };
  const env: Record<string, string> = {};
  const paypalKeys: [string, string][] = [
    ["paypal_enabled","enabled"],["paypal_liveMode","liveMode"],["paypal_clientId","clientId"],["paypal_clientSecret","clientSecret"],
  ];
  for (const [k, f] of paypalKeys) if (envLocked(k)) env[f] = getEnvVarName(k)!;
  return NextResponse.json({ data: {
    enabled: enabled === "true",
    liveMode: liveMode === "true",
    clientId: clientId ?? "",
    clientSecretSet: !!clientSecret,
  }, env });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { enabled, clientId, clientSecret, liveMode } = parsed.data;

  await setSetting("paypal_enabled", String(enabled));
  await setSetting("paypal_liveMode", String(liveMode));
  if (clientId !== undefined) await setSetting("paypal_clientId", clientId);
  if (clientSecret) await setSetting("paypal_clientSecret", clientSecret);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const changes: string[] = [
    `enabled=${enabled}`, `liveMode=${liveMode}`,
    ...(clientId !== undefined ? [`clientId="${clientId}"`] : []),
    ...(clientSecret ? ["clientSecret=set"] : []),
  ];
  await logAudit({ userEmail: admin.email, action: "update", resource: "settings.paypal", detail: changes.join("; "), ip });
  return NextResponse.json({ ok: true });
}
