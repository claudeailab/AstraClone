import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getSetting, setSetting, getEnvOverride, getEnvVarName } from "@/lib/encryption";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  enabled: z.boolean(),
  publishableKey: z.string().optional(),
  secretKey: z.string().optional(),
  webhookSecret: z.string().optional(),
  liveMode: z.boolean(),
});

export async function GET() {
  await requireAdmin();
  const [enabled, liveMode, publishableKey, secretKey, webhookSecret] = await Promise.all([
    getSetting("stripe_enabled"),
    getSetting("stripe_liveMode"),
    getSetting("stripe_publishableKey"),
    getSetting("stripe_secretKey"),
    getSetting("stripe_webhookSecret"),
  ]);
  const envLocked = (k: string) => { const v = getEnvOverride(k); return v !== undefined && v !== ""; };
  const env: Record<string, string> = {};
  const stripeKeys: [string, string][] = [
    ["stripe_enabled","enabled"],["stripe_liveMode","liveMode"],["stripe_publishableKey","publishableKey"],
    ["stripe_secretKey","secretKey"],["stripe_webhookSecret","webhookSecret"],
  ];
  for (const [k, f] of stripeKeys) if (envLocked(k)) env[f] = getEnvVarName(k)!;
  return NextResponse.json({ data: {
    enabled: enabled !== "false",
    liveMode: liveMode === "true",
    publishableKey: publishableKey ?? "",
    secretKeySet: !!secretKey,
    webhookSecretSet: !!webhookSecret,
  }, env });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { enabled, publishableKey, secretKey, webhookSecret, liveMode } = parsed.data;

  const prevLiveMode = await getSetting("stripe_liveMode");
  await setSetting("stripe_enabled", String(enabled));
  await setSetting("stripe_liveMode", String(liveMode));
  if (publishableKey) await setSetting("stripe_publishableKey", publishableKey);
  if (secretKey) await setSetting("stripe_secretKey", secretKey);
  if (webhookSecret) await setSetting("stripe_webhookSecret", webhookSecret);

  const changes: string[] = [];
  if (String(liveMode) !== (prevLiveMode ?? "false")) changes.push(`liveMode: ${prevLiveMode ?? "false"}→${liveMode}`);
  if (publishableKey) changes.push("publishableKey: [updated]");
  if (secretKey) changes.push("secretKey: [updated]");
  if (webhookSecret) changes.push("webhookSecret: [updated]");

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  await logAudit({ userEmail: admin.email, action: "update", resource: "settings.payments", detail: changes.join("; ") || "no changes", ip });
  return NextResponse.json({ ok: true });
}
