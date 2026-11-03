import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/auth";
import { getDatabase } from "@/lib/db";

export default async function DashboardPage() {
  const session = await getSession();

  if (!session?.workspace?.id) {
    redirect("/login");
  }

  const db = await getDatabase();

  const workspaceId = ObjectId.createFromHexString(session.workspace.id);

  const [contacts, campaigns, whatsapp] = await Promise.all([
    db.collection("contacts").countDocuments({ workspaceId }),
    db.collection("campaigns").countDocuments({ workspaceId }),
    db.collection("whatsappAccounts").findOne({ workspaceId }),
  ]);

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border p-5">
          <p className="text-gray-500">Contacts</p>
          <h2 className="text-3xl font-bold">{contacts}</h2>
        </div>

        <div className="rounded-xl border p-5">
          <p className="text-gray-500">Campaigns</p>
          <h2 className="text-3xl font-bold">{campaigns}</h2>
        </div>

        <div className="rounded-xl border p-5">
          <p className="text-gray-500">WhatsApp</p>
          <h2 className="text-xl font-bold">
            {whatsapp ? "Connected" : "Not connected"}
          </h2>
        </div>
      </div>
    </main>
  );
}
