"use client";

import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { LayoutDashboard, LogOut, ShieldCheck } from "lucide-react";
import type { PlatformInfo } from "@/lib/platform";
import { iconUrl } from "@/lib/platform-shared";
import version from "../../../version.json";

interface Props {
  user: { email: string; displayName?: string | null; isAdmin: boolean; area: "admin" | "user" };
  platform: PlatformInfo;
}

function initials(str: string) {
  const parts = str.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return str.slice(0, 2).toUpperCase();
}

const itemClass = "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none cursor-pointer data-[highlighted]:bg-secondary";

export default function UserHeader({ user, platform }: Props) {
  const name = user.displayName ?? user.email;
  return (
    <header className="sidebar-panel sticky top-0 z-40 border-b">
      <div className="mx-auto w-full max-w-5xl h-14 px-4 md:px-8 flex items-center justify-between gap-4">
        <Link href="/user" className="flex items-center gap-2.5 min-w-0">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0 relative"
            style={{ background: "color-mix(in srgb, var(--color-primary) 12%, transparent)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={iconUrl(platform.icon, encodeURIComponent(platform.primaryColor))}
              alt=""
              className="h-6 w-6"
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).nextElementSibling?.removeAttribute("hidden"); }}
            />
            <span hidden className="text-primary text-xs font-bold absolute">{platform.name.slice(0, 1).toUpperCase()}</span>
          </span>
          <span className="font-bold text-base tracking-tight truncate">{platform.name}</span>
        </Link>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            className="h-9 w-9 rounded-full flex items-center justify-center text-primary text-xs font-bold shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ background: "color-mix(in srgb, var(--color-primary) 12%, transparent)" }}
            aria-label="Profile menu"
          >
            {initials(name)}
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={8} className="z-50 min-w-56 rounded-lg border bg-popover text-popover-foreground p-1 shadow-lg">
              <div className="px-2.5 py-2">
                <p className="text-sm font-medium truncate">{name}</p>
                <p className="text-xs text-foreground/60 font-mono font-semibold">v{version.version}</p>
              </div>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <DropdownMenu.Item asChild className={itemClass}>
                <Link href="/user"><LayoutDashboard className="h-4 w-4 opacity-60" />Dashboard</Link>
              </DropdownMenu.Item>
              {user.isAdmin && (
                <DropdownMenu.Item asChild className={itemClass}>
                  <Link href="/admin"><ShieldCheck className="h-4 w-4 opacity-60" />Admin panel</Link>
                </DropdownMenu.Item>
              )}
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <DropdownMenu.Item asChild className={itemClass}>
                <a href={`/api/auth/logout?area=${user.area}`}><LogOut className="h-4 w-4 opacity-60" />Log out</a>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  );
}
