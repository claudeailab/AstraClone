import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { sessions, users, permission_groups } from "./db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { roleFromPermissions } from "./permissions";

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("astraclone-session")?.value;
  if (!token) return null;

  const [session] = await db
    .select({ id: sessions.id, userId: sessions.userId, expiresAt: sessions.expiresAt })
    .from(sessions)
    .where(eq(sessions.id, token))
    .limit(1);

  if (!session || session.expiresAt < new Date()) return null;
  return session;
}

export async function getUser() {
  const session = await getSession();
  if (!session) return null;

  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      displayName: users.displayName,
      groupId: users.groupId,
      permissions: permission_groups.permissions,
    })
    .from(users)
    .leftJoin(permission_groups, eq(users.groupId, permission_groups.id))
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!row) return null;
  const role = roleFromPermissions(row.permissions);
  return { id: row.id, email: row.username ?? row.email, displayName: row.displayName, groupId: row.groupId, role, isAdmin: role === "administrator" };
}

export async function requireSession() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireUserArea() {
  const user = await getUser();
  if (!user || !user.role) redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await getUser();
  if (!user || !user.isAdmin) redirect("/login");
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
