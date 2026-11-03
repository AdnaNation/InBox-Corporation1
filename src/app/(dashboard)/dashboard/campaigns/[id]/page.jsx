import Link from "next/link";
import { notFound } from "next/navigation";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import CampaignTemplateVerification from "@/components/campaign-template-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function Status({ value }) {
  const styles = {
    pending: "bg-amber-50 text-amber-700",
    accepted: "bg-blue-50 text-blue-700",
    sent: "bg-blue-50 text-blue-700",
    delivered: "bg-green-50 text-green-700",
    read: "bg-purple-50 text-purple-700",
    failed: "bg-red-50 text-red-700",
  };

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-medium ${styles[value] || "bg-slate-100 text-slate-600"}`}
    >
      {value || "unknown"}
    </span>
  );
}

export default async function CampaignReviewPage({ params, searchParams }) {
  const session = await getSession();
  if (!session) notFound();

  const { id } = await params;
  if (!ObjectId.isValid(id)) notFound();

  const db = await getDatabase();
  const workspaceId = new ObjectId(session.workspace.id);
  const campaignId = new ObjectId(id);

  const campaign = await db.collection("campaigns").findOne({
    _id: campaignId,
    workspaceId,
  });

  if (!campaign) notFound();

  const statusCounts = await db
    .collection("campaignRecipients")
    .aggregate([
      { $match: { campaignId, workspaceId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ])
    .toArray();

  const counts = Object.fromEntries(
    statusCounts.map((item) => [item._id, item.count]),
  );

  const totalRecipients = Object.values(counts).reduce(
    (sum, value) => sum + value,
    0,
  );

  const pageSize = 50;
  const query = await searchParams;
  const requestedPage = Number.parseInt(query?.page || "1", 10);
  const totalPages = Math.max(1, Math.ceil(totalRecipients / pageSize));
  const currentPage = Number.isFinite(requestedPage)
    ? Math.min(Math.max(requestedPage, 1), totalPages)
    : 1;

  const recipients = await db
    .collection("campaignRecipients")
    .find({ campaignId, workspaceId })
    .project({
      name: 1,
      phone: 1,
      status: 1,
      error: 1,
      createdAt: 1,
    })
    .sort({ createdAt: 1, _id: 1 })
    .skip((currentPage - 1) * pageSize)
    .limit(pageSize)
    .toArray();

  const firstRecipient = totalRecipients
    ? (currentPage - 1) * pageSize + 1
    : 0;
  const lastRecipient = Math.min(currentPage * pageSize, totalRecipients);

  const createdAt = campaign.createdAt
    ? new Date(campaign.createdAt).toLocaleString()
    : "—";

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-5 sm:p-8">
      <Link
        href="/dashboard/campaigns"
        className="text-sm font-medium text-green-700 hover:underline"
      >
        ← Back to campaigns
      </Link>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Campaign review
            </p>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">
              {campaign.name}
            </h1>
            <p className="mt-2 text-sm text-slate-500">Created {createdAt}</p>
          </div>

          <Status value={campaign.status} />
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs text-slate-500">Recipient snapshot</p>
            <p className="mt-1 text-2xl font-bold">{totalRecipients}</p>
          </div>

          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs text-slate-500">Pending recipients</p>
            <p className="mt-1 text-2xl font-bold">{counts.pending || 0}</p>
          </div>

          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs text-slate-500">Failed recipients</p>
            <p className="mt-1 text-2xl font-bold">{counts.failed || 0}</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold">Message template</h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-slate-500">Template name</p>
            <p className="mt-1 font-medium">
              {campaign.template?.name || "Not selected"}
            </p>
          </div>

          <div>
            <p className="text-xs text-slate-500">Language</p>
            <p className="mt-1 font-medium">
              {campaign.template?.language || "—"}
            </p>
          </div>

          <div>
            <p className="text-xs text-slate-500">Template verification</p>
            <p className="mt-1 font-medium">
              {campaign.templateVerification || "Not verified"}
            </p>
          </div>

          <div>
            <p className="text-xs text-slate-500">Body parameters configured</p>
            <p className="mt-1 font-medium">
              {(campaign.bodyParameters || []).filter((value) => value !== "").length} of {campaign.template?.bodyVariableCount ?? "—"}
            </p>
          </div>

          <div>
            <p className="text-xs text-slate-500">Audience type</p>
            <p className="mt-1 font-medium">
              {campaign.audience?.type || "—"}
              {campaign.audience?.groupName
                ? ` — ${campaign.audience.groupName}`
                : ""}
              {campaign.audience?.tag ? ` — ${campaign.audience.tag}` : ""}
            </p>
          </div>
        </div>

        <CampaignTemplateVerification
          campaignId={campaign._id.toString()}
          initialVerification={campaign.templateVerification || "pending"}
          initialMessage={campaign.templateVerificationMessage || ""}
          initialMetaStatus={campaign.template?.status || ""}
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Recipient list</h2>
            <p className="mt-1 text-xs text-slate-500">
              These contacts were saved when this draft was created.
            </p>
          </div>
          <span className="text-xs text-slate-500">
            Showing {firstRecipient}–{lastRecipient} of {totalRecipients}
          </span>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-150 text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Error</th>
              </tr>
            </thead>

            <tbody>
              {recipients.map((recipient) => (
                <tr
                  key={recipient._id.toString()}
                  className="border-t border-slate-100"
                >
                  <td className="px-4 py-3 font-medium">
                    {recipient.name || "Unnamed"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {recipient.phone}
                  </td>
                  <td className="px-4 py-3">
                    <Status value={recipient.status} />
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-xs text-red-600">
                    {recipient.error || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {recipients.length === 0 && (
            <p className="py-10 text-center text-sm text-slate-400">
              No recipients found.
            </p>
          )}
        </div>

        {totalPages > 1 && (
          <nav
            aria-label="Recipient pages"
            className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4"
          >
            <p className="text-xs text-slate-500">
              Page {currentPage} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              {currentPage > 1 ? (
                <Link
                  href={currentPage === 2 ? `/dashboard/campaigns/${id}` : `/dashboard/campaigns/${id}?page=${currentPage - 1}`}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Previous
                </Link>
              ) : (
                <span className="rounded-lg border border-slate-100 px-3 py-2 text-sm text-slate-300">
                  Previous
                </span>
              )}
              {currentPage < totalPages ? (
                <Link
                  href={`/dashboard/campaigns/${id}?page=${currentPage + 1}`}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Next
                </Link>
              ) : (
                <span className="rounded-lg border border-slate-100 px-3 py-2 text-sm text-slate-300">
                  Next
                </span>
              )}
            </div>
          </nav>
        )}
      </section>
    </main>
  );
}
