import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/platform-admin";
import PlatformAdminClient from "@/components/platform-admin-client";
import PlatformPricingEditor from "@/components/platform-pricing-editor";

export const dynamic = "force-dynamic";

export default async function PlatformAdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isPlatformAdmin(session)) redirect("/dashboard");

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-5 sm:p-8">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">InBox Corporation</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Platform administration</h1>
        <p className="mt-1 text-sm text-slate-500">Manage customer workspaces, plans, pricing, and upgrade requests.</p>
      </div>
      <PlatformPricingEditor />
      <PlatformAdminClient />
    </main>
  );
}
