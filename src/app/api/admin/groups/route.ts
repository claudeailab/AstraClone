import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { permission_groups, users } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";
import { logAudit } from "@/lib/audit";
import { ROLE_KEYS, roleFromPermissions } from "@/lib/permissions";

const groupSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().max(500).optional(),
  role: z.enum(ROLE_KEYS),
});

export async function GET() {
  await requireAdmin();
  const rows = await db
    .select({
      id: permission_groups.id,
      name: permission_groups.name,
      description: permission_groups.description,
      permissions: permission_groups.permissions,
      createdAt: permission_groups.createdAt,
      userCount: count(users.id),
    })
    .from(permission_groups)
    .leftJoin(users, eq(users.groupId, permission_groups.id))
    .groupBy(permission_groups.id)
    .limit(100);

  return NextResponse.json({
    groups: rows.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      createdAt: r.createdAt,
      userCount: r.userCount,
      role: roleFromPermissions(r.permissions),
    })),
  });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => null);
  const parsed = groupSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { name, description, role } = parsed.data;
  await db.insert(permission_groups).values({
    name, description, permissions: JSON.stringify([role]),
  });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  await logAudit({ userEmail: admin.email, action: "create", resource: "group", detail: `name=${name}; role=${role}`, ip });
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const admin = await requireAdmin();
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const parsed = groupSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { name, description, role } = parsed.data;
  await db.update(permission_groups)
    .set({ name, description, permissions: JSON.stringify([role]) })
    .where(eq(permission_groups.id, id));

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  await logAudit({ userEmail: admin.email, action: "update", resource: "group", detail: `id=${id}; name=${name}; role=${role}`, ip });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await db.update(users).set({ groupId: null }).where(eq(users.groupId, id));
  await db.delete(permission_groups).where(eq(permission_groups.id, id));

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  await logAudit({ userEmail: admin.email, action: "delete", resource: "group", detail: `id=${id}`, ip });
  return NextResponse.json({ ok: true });
}
