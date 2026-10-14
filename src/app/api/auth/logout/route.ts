import { NextRequest, NextResponse } from "next/server";
import { deleteSession } from "@/lib/auth";
import { getBaseUrl } from "@/lib/base-url";

async function logout(req: NextRequest) {
  const token = req.cookies.get("astraclone-session")?.value;
  if (token) await deleteSession(token);
  const res = NextResponse.redirect(`${getBaseUrl(req)}/login`);
  res.cookies.delete("astraclone-session");
  return res;
}

export async function GET(req: NextRequest) { return logout(req); }
export async function POST(req: NextRequest) { return logout(req); }
