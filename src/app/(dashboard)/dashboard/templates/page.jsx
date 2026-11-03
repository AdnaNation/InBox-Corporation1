import { getSession } from "@/lib/auth";
import TemplateLibraryClient from "@/components/template-library-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const session = await getSession();

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-5 sm:p-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          WhatsApp Templates
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          View and manage message templates from your connected WhatsApp
          Business Account.
        </p>
      </div>

      <TemplateLibraryClient />
    </main>
  );
}
