import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import DashboardShell from "@/components/dashboard-shell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }) {
  const session = await getSession();
  if (!session) redirect("/login");
  return <DashboardShell session={session}>{children}</DashboardShell>;
}
