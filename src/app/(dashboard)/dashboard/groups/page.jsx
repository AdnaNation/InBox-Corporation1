import GroupsClient from "@/components/groups-client";

export default function GroupsPage() {
  return (
    <div className="mx-auto max-w-7xl p-5 sm:p-8">
      <div className="mb-7">
        <h1 className="text-2xl font-bold">Contact Groups</h1>

        <p className="mt-1 text-sm text-slate-500">
          Organize your contacts into groups for easier campaign targeting.
        </p>
      </div>

      <GroupsClient />
    </div>
  );
}
