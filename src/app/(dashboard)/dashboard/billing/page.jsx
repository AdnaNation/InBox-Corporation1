import BillingClient from "@/components/billing-client";

export default function BillingPage() {
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-5 sm:p-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Billing</h1>
        <p className="mt-1 text-sm text-slate-500">Manage your workspace plan and review usage.</p>
      </div>
      <BillingClient />
    </main>
  );
}
