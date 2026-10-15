import { NextRequest, NextResponse } from "next/server";
import { deleteSession, sessionCookieName, type SessionArea } from "@/lib/auth";
import { getBaseUrl } from "@/lib/base-url";

// Signs out of one area (?area=admin|user) and leaves the other area's session intact.
async function logout(req: NextRequest) {
  const area = new URL(req.url).searchParams.get("area");
  const areas: SessionArea[] = area === "admin" || area === "user" ? [area] : ["admin", "user"];
  const res = NextResponse.redirect(`${getBaseUrl(req)}/login`);
  for (const a of areas) {
    const name = sessionCookieName(a);
    const token = req.cookies.get(name)?.value;
    if (token) await deleteSession(token);
    res.cookies.delete(name);
  }
  return res;
}

export async function GET(req: NextRequest) { return logout(req); }
export async function POST(req: NextRequest) { return logout(req); }
