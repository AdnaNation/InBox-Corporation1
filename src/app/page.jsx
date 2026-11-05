import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getSession();

  if (session?.workspace?.id) {
    // Keep the root URL inside the authenticated route group so its
    // DashboardShell navigation is always rendered.
    redirect("/dashboard");
  }

  redirect("/login");
}
