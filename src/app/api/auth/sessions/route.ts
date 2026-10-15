import { NextResponse } from "next/server";
import { getSignedInSessions } from "@/lib/auth";

export async function GET() {
  const { admin, user } = await getSignedInSessions();
  const view = (u: typeof admin) => (u ? { name: u.displayName ?? u.email } : null);
  return NextResponse.json({ admin: view(admin), user: view(user) });
}
