import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { homeForRole } from "@/lib/permissions";

export default async function HomePage() {
  const user = await getUser();
  if (!user?.role) redirect("/login");
  redirect(homeForRole(user.role));
}
