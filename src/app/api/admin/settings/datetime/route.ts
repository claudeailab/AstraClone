import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getSetting, setSetting, getEnvOverride } from "@/lib/encryption";
import { logAudit } from "@/lib/audit";

const DATE_FORMATS = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD", "DD MMM YYYY", "MMM DD, YYYY"] as const;

const schema = z.object({
  timezone: z.string().min(1).optional(),
  dateFormat: z.enum(DATE_FORMATS).optional(),
  timeFormat: z.enum(["12h", "24h"]).optional(),
});

export async function GET() {
  await requireAdmin();
  const [timezone, dateFormat, timeFormat] = await Promise.all([
    getSetting("platform_timezone"),
    getSetting("platform_dateFormat"),
    getSetting("platform_timeFormat"),
  ]);
  return NextResponse.json({
    timezone: timezone ?? "UTC",
    dateFormat: dateFormat ?? "DD/MM/YYYY",
    timeFormat: timeFormat ?? "24h",
    timezoneFromEnv: !!getEnvOverride("platform_timezone"),
  });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { timezone, dateFormat, timeFormat } = parsed.data;
  const [prevTz, prevDf, prevTf] = await Promise.all([
    getSetting("platform_timezone"),
    getSetting("platform_dateFormat"),
    getSetting("platform_timeFormat"),
  ]);

  const changes: string[] = [];
  if (timezone !== undefined && timezone !== (prevTz ?? "UTC")) {
    await setSetting("platform_timezone", timezone);
    changes.push(`timezone: ${prevTz ?? "UTC"}→${timezone}`);
  }
  if (dateFormat !== undefined && dateFormat !== (prevDf ?? "DD/MM/YYYY")) {
    await setSetting("platform_dateFormat", dateFormat);
    changes.push(`dateFormat: ${prevDf ?? "DD/MM/YYYY"}→${dateFormat}`);
  }
  if (timeFormat !== undefined && timeFormat !== (prevTf ?? "24h")) {
    await setSetting("platform_timeFormat", timeFormat);
    changes.push(`timeFormat: ${prevTf ?? "24h"}→${timeFormat}`);
  }

  if (changes.length > 0) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    await logAudit({ userEmail: admin.email, action: "update", resource: "datetime_settings", detail: changes.join("; "), ip });
  }

  return NextResponse.json({ ok: true });
}
