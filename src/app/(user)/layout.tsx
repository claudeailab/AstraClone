import { requireUserArea } from "@/lib/auth";
import { getPlatformInfo } from "@/lib/platform";
import UserHeader from "@/components/user/UserHeader";

export default async function UserLayout({ children }: { children: React.ReactNode }) {
  const [user, platform] = await Promise.all([requireUserArea(), getPlatformInfo()]);
  return (
    <div className="min-h-screen flex flex-col">
      <UserHeader user={user} platform={platform} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
