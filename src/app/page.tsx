import { redirect } from "next/navigation";
import { getAdmin, getUser } from "@/lib/auth";

export default async function HomePage() {
  if (await getAdmin()) redirect("/admin");
  if (await getUser()) redirect("/user");
  redirect("/login");
}
