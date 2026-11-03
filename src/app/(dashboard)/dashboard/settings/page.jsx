import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();

  if (!session?.workspace || !session?.membership || !session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto max-w-4xl p-5 sm:p-8">
      <h1 className="text-2xl font-bold">Settings</h1>
      <p className="mt-1 text-sm text-slate-500">
        Your account and workspace information.
      </p>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold">Workspace</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-400">Workspace name</dt>
            <dd className="mt-1 text-sm font-medium">{session.workspace.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Workspace slug</dt>
            <dd className="mt-1 text-sm font-medium">{session.workspace.slug}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Your role</dt>
            <dd className="mt-1 text-sm font-medium capitalize">{session.membership.role}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Account email</dt>
            <dd className="mt-1 text-sm font-medium">{session.user.email}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
