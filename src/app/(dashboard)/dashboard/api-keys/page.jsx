import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import ApiKeysClient from "@/components/api-keys-client";

export const dynamic = "force-dynamic";

export default async function ApiKeysPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!["owner", "admin"].includes(session.membership.role)) redirect("/dashboard");
  return <div className="mx-auto max-w-5xl p-5 sm:p-8">
    <div className="mb-6"><h1 className="text-2xl font-bold text-slate-900">API access</h1><p className="mt-1 text-sm text-slate-500">Manage secure API credentials for external integrations.</p></div>
    <ApiKeysClient />
  </div>;
}
