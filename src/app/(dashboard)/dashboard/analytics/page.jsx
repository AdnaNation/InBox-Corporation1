import AnalyticsClient from "@/components/analytics-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function AnalyticsPage() {
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-5 sm:p-8">
      <AnalyticsClient />
    </main>
  );
}
