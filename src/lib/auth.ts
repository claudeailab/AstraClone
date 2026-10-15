import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { sessions, users, permission_groups } from "./db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { roleFromPermissions, type Role } from "./permissions";
import { SECURITY_CONVENTIONS } from "./security-conventions";
import type { NextResponse } from "next/server";

export type SessionArea = keyof typeof SECURITY_CONVENTIONS.sessionCookies;

export function sessionCookieName(area: SessionArea) {
  return SECURITY_CONVENTIONS.sessionCookies[area];
}

export function sessionAreaForRole(role: Role): SessionArea {
  return role === "administrator" ? "admin" : "user";
}

export function setSessionCookie(res: NextResponse, role: Role, token: string, secure: boolean) {
  res.cookies.set(sessionCookieName(sessionAreaForRole(role)), token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60,
    path: "/",
  });
}

async function getAreaUser(area: SessionArea) {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName(area))?.value;
  if (!token) return null;

  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      displayName: users.displayName,
      groupId: users.groupId,
      disabled: users.disabled,
      expiresAt: sessions.expiresAt,
      permissions: permission_groups.permissions,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .leftJoin(permission_groups, eq(users.groupId, permission_groups.id))
    .where(eq(sessions.id, token))
    .limit(1);

  if (!row || row.expiresAt < new Date() || row.disabled) return null;
  const role = roleFromPermissions(row.permissions);
  if (!role || sessionAreaForRole(role) !== area) return null;
  return { id: row.id, email: row.username ?? row.email, displayName: row.displayName, groupId: row.groupId, role, isAdmin: role === "administrator", area };
}

/** The signed-in user for the user area (an administrator session also qualifies). */
export async function getUser() {
  return (await getAreaUser("user")) ?? (await getAreaUser("admin"));
}

export async function getAdmin() {
  return getAreaUser("admin");
}

export async function requireSession() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireUserArea() {
  return requireSession();
}

export async function requireAdmin() {
  const user = await getAdmin();
  if (!user) redirect("/login");
  return user;
}

export async function createSession(userId: number): Promise<string> {
  const id = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ id, userId, expiresAt });
  return id;
}

export async function deleteSession(token: string) {
  await db.delete(sessions).where(eq(sessions.id, token));
}
