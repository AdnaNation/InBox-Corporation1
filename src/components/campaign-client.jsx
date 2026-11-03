"use client";

import { useEffect, useState } from "react";
import { Send, AlertCircle, Loader2, Users, RefreshCw } from "lucide-react";

export default function CampaignClient({ contactCount, connected, campaigns }) {
  // Existing single-contact sender
  const [form, setForm] = useState({
    contactId: "",
    templateName: "",
    language: "en_US",
    parameters: "",
  });

  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  // Audience selector
  const [audienceType, setAudienceType] = useState("all");
  const [groupId, setGroupId] = useState("");
  const [tag, setTag] = useState("");

  const [groups, setGroups] = useState([]);
  const [availableTags, setAvailableTags] = useState([]);

  const [loadingOptions, setLoadingOptions] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [audiencePreview, setAudiencePreview] = useState(null);
  const [audienceError, setAudienceError] = useState("");

  // Load groups and available tags
  useEffect(() => {
    async function loadAudienceOptions() {
      setLoadingOptions(true);

      try {
        const [groupsResponse, contactsResponse] = await Promise.all([
          fetch("/api/groups"),
          fetch("/api/contacts?limit=5000"),
        ]);

        const groupsData = await groupsResponse.json();
        const contactsData = await contactsResponse.json();

        if (!groupsResponse.ok || !groupsData.success) {
          throw new Error(groupsData.message || "Could not load groups.");
        }

        if (!contactsResponse.ok || !contactsData.success) {
          throw new Error(contactsData.message || "Could not load contacts.");
        }

        setGroups(groupsData.groups || []);

        const tags = [
          ...new Set(
            (contactsData.contacts || [])
              .flatMap((contact) => contact.tags || [])
              .filter(Boolean)
              .map((value) => value.trim()),
          ),
        ].sort((a, b) => a.localeCompare(b));

        setAvailableTags(tags);
      } catch (error) {
        setAudienceError(error.message || "Could not load audience options.");
      } finally {
        setLoadingOptions(false);
      }
    }

    loadAudienceOptions();
  }, []);

  // Preview selected audience
  async function previewAudience() {
    setPreviewLoading(true);
    setAudienceError("");
    setAudiencePreview(null);

    try {
      const payload = {
        type: audienceType,
      };

      if (audienceType === "group") {
        payload.groupId = groupId;
      }

      if (audienceType === "tag") {
        payload.tag = tag;
      }

      const response = await fetch("/api/campaigns/audience", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not preview audience.");
      }

      setAudiencePreview(data);
    } catch (error) {
      setAudienceError(error.message || "Something went wrong.");
    } finally {
      setPreviewLoading(false);
    }
  }

  // Existing single-contact template sender
  async function handleSendTemplate(e) {
    e.preventDefault();

    setLoading(true);
    setResult("");

    try {
      const response = await fetch("/api/campaigns/send-template", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...form,
          parameters: form.parameters
            ? form.parameters.split(",").map((value) => value.trim())
            : [],
        }),
      });

      const data = await response.json();

      setResult(data.message || "Request complete.");
    } catch {
      setResult("Network error.");
    } finally {
      setLoading(false);
    }
  }

  const canPreview =
    !loadingOptions &&
    !previewLoading &&
    (audienceType === "all" ||
      (audienceType === "group" && groupId) ||
      (audienceType === "tag" && tag));

  return (
    <div className="space-y-5">
      {/* Audience selection */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-green-50 p-3 text-green-600">
            <Users size={22} />
          </div>

          <div>
            <h2 className="font-semibold">Campaign Audience</h2>
            <p className="text-xs text-slate-500">
              Choose which opted-in contacts you want to target.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => {
              setAudienceType("all");
              setAudiencePreview(null);
              setAudienceError("");
            }}
            className={`rounded-xl border p-4 text-left transition ${
              audienceType === "all"
                ? "border-green-500 bg-green-50"
                : "border-slate-200 hover:border-green-300"
            }`}
          >
            <p className="font-semibold text-sm">All Contacts</p>
            <p className="mt-1 text-xs text-slate-500">All opted-in contacts</p>
          </button>

          <button
            type="button"
            onClick={() => {
              setAudienceType("group");
              setAudiencePreview(null);
              setAudienceError("");
            }}
            className={`rounded-xl border p-4 text-left transition ${
              audienceType === "group"
                ? "border-green-500 bg-green-50"
                : "border-slate-200 hover:border-green-300"
            }`}
          >
            <p className="font-semibold text-sm">By Group</p>
            <p className="mt-1 text-xs text-slate-500">
              Select a saved contact group
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              setAudienceType("tag");
              setAudiencePreview(null);
              setAudienceError("");
            }}
            className={`rounded-xl border p-4 text-left transition ${
              audienceType === "tag"
                ? "border-green-500 bg-green-50"
                : "border-slate-200 hover:border-green-300"
            }`}
          >
            <p className="font-semibold text-sm">By Tag</p>
            <p className="mt-1 text-xs text-slate-500">
              Target contacts with a tag
            </p>
          </button>
        </div>

        {audienceType === "group" && (
          <div className="mt-5">
            <label className="block text-sm font-medium">Select Group</label>

            <select
              value={groupId}
              onChange={(e) => {
                setGroupId(e.target.value);
                setAudiencePreview(null);
              }}
              disabled={loadingOptions}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-green-500"
            >
              <option value="">Choose a group</option>

              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name} ({group.contactCount} contacts)
                </option>
              ))}
            </select>

            {!loadingOptions && groups.length === 0 && (
              <p className="mt-2 text-xs text-slate-500">
                You haven't created any contact groups yet.
              </p>
            )}
          </div>
        )}

        {audienceType === "tag" && (
          <div className="mt-5">
            <label className="block text-sm font-medium">Select Tag</label>

            <select
              value={tag}
              onChange={(e) => {
                setTag(e.target.value);
                setAudiencePreview(null);
              }}
              disabled={loadingOptions}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-green-500"
            >
              <option value="">Choose a tag</option>

              {availableTags.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            {!loadingOptions && availableTags.length === 0 && (
              <p className="mt-2 text-xs text-slate-500">
                No tags found. Add tags to your contacts first.
              </p>
            )}
          </div>
        )}

        <button
          type="button"
          disabled={!canPreview}
          onClick={previewAudience}
          className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {previewLoading ? (
            <Loader2 size={17} className="animate-spin" />
          ) : (
            <RefreshCw size={17} />
          )}
          Preview Audience
        </button>

        {audienceError && (
          <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {audienceError}
          </p>
        )}

        {audiencePreview && (
          <div className="mt-5 rounded-xl border border-green-200 bg-green-50 p-4">
            <p className="text-sm font-medium text-green-800">
              Eligible contacts
            </p>

            <p className="mt-1 text-3xl font-bold text-green-700">
              {audiencePreview.total}
            </p>

            <p className="mt-1 text-xs text-green-700">
              Only contacts with recorded WhatsApp opt-in are included.
            </p>

            {audiencePreview.preview.length > 0 ? (
              <div className="mt-4 overflow-x-auto rounded-xl border border-green-100 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-3">Name</th>
                      <th className="px-3 py-3">Phone</th>
                      <th className="px-3 py-3">Tags</th>
                    </tr>
                  </thead>

                  <tbody>
                    {audiencePreview.preview.map((contact) => (
                      <tr
                        key={contact.id}
                        className="border-t border-slate-100"
                      >
                        <td className="px-3 py-3 font-medium">
                          {contact.name}
                        </td>

                        <td className="px-3 py-3 text-slate-600">
                          {contact.phone}
                        </td>

                        <td className="px-3 py-3 text-slate-500">
                          {(contact.tags || []).join(", ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-4 text-sm text-green-800">
                No eligible contacts found for this audience.
              </p>
            )}

            {audiencePreview.total > 20 && (
              <p className="mt-3 text-xs text-green-700">
                Showing the first 20 contacts out of {audiencePreview.total}.
              </p>
            )}
          </div>
        )}
      </section>

      {/* Existing single-contact sender */}
      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <form
          onSubmit={handleSendTemplate}
          className="h-fit rounded-2xl border border-slate-200 bg-white p-5"
        >
          <h2 className="font-semibold">Send a template message</h2>

          <p className="mt-1 text-xs leading-5 text-slate-500">
            This currently sends one approved template to one opted-in contact.
            Audience preview does not trigger bulk sending.
          </p>

          {(!connected || contactCount === 0) && (
            <div className="mt-4 flex gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">
              <AlertCircle size={17} className="shrink-0" />
              {!connected
                ? "Connect WhatsApp before sending."
                : "Add opted-in contacts before sending."}
            </div>
          )}

          <label className="mt-5 block text-sm font-medium">
            Contact ID
            <input
              required
              value={form.contactId}
              onChange={(e) => setForm({ ...form, contactId: e.target.value })}
              placeholder="MongoDB contact ID"
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-green-500"
            />
          </label>

          <label className="mt-4 block text-sm font-medium">
            Approved template name
            <input
              required
              value={form.templateName}
              onChange={(e) =>
                setForm({ ...form, templateName: e.target.value })
              }
              placeholder="hello_world"
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-green-500"
            />
          </label>

          <label className="mt-4 block text-sm font-medium">
            Language code
            <input
              required
              value={form.language}
              onChange={(e) => setForm({ ...form, language: e.target.value })}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-green-500"
            />
          </label>

          <label className="mt-4 block text-sm font-medium">
            Body parameters (comma separated)
            <input
              value={form.parameters}
              onChange={(e) => setForm({ ...form, parameters: e.target.value })}
              placeholder="John, Order 123"
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-green-500"
            />
          </label>

          <button
            disabled={loading || !connected || contactCount === 0}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? (
              <Loader2 size={17} className="animate-spin" />
            ) : (
              <Send size={17} />
            )}
            Send template
          </button>

          {result && (
            <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
              {result}
            </p>
          )}
        </form>

        {/* Campaign history */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">Recent campaigns</h2>

          <p className="mt-1 text-xs text-slate-500">
            Campaign history will appear here as campaign scheduling is added.
          </p>

          {campaigns.length ? (
            <div className="mt-5 divide-y divide-slate-100">
              {campaigns.map((campaign) => (
                <div
                  key={campaign.id}
                  className="flex items-center justify-between py-3"
                >
                  <div>
                    <p className="text-sm font-medium">{campaign.name}</p>
                    <p className="text-xs text-slate-400">
                      {campaign.createdAt
                        ? new Date(campaign.createdAt).toLocaleString()
                        : ""}
                    </p>
                  </div>

                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs">
                    {campaign.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-16 text-center text-sm text-slate-400">
              No campaigns yet.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
