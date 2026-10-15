import { requireUserArea } from "@/lib/auth";
import { pageWrapper, pageInner, pageTitle, muted, sectionGap } from "@/lib/ui-conventions";
import SyncStatusBoard from "@/components/user/SyncStatusBoard";

export default async function UserPage() {
  const user = await requireUserArea();
  return (
    <div className={pageWrapper}>
      <div className={`${pageInner} ${sectionGap}`}>
        <div className="flex flex-col gap-1">
          <h1 className={pageTitle}>Dashboard</h1>
          <p className={muted}>Welcome, {user.displayName ?? user.email}. Live status of every repository synchronization.</p>
        </div>
        <SyncStatusBoard />
      </div>
    </div>
  );
}
