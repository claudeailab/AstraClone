import { redirect } from "next/navigation";

// The login page lists any active admin/user sessions, so it is always the entry point.
export default function HomePage() {
  redirect("/login");
}
