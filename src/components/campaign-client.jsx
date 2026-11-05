"use client";

import { useEffect, useState } from "react";
import { Send, AlertCircle, Loader2, Users, RefreshCw, FileText, CheckCircle2 } from "lucide-react";
import Link from "next/link";

export default function CampaignClient({ contactCount, connected, campaigns }) {
  // Existing single-contact sender
  const [form, setForm] = useState({
    contactId: "",
    templateName: "",
    language: "",
    parameters: [],
    couponCode: "",
    expirationTime: "",
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
  // Meta template library and campaign draft form
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState("");
  const [selectedTemplateKey, setSelectedTemplateKey] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [campaignBodyParameters, setCampaignBodyParameters] = useState([]);
  const [campaignCouponCode, setCampaignCouponCode] = useState("");
  const [offerDurationHours, setOfferDurationHours] = useState("24");
  const [createLoading, setCreateLoading] = useState(false);
  const [createResult, setCreateResult] = useState(null);

  const selectedTemplate = templates.find(
    (item) => `${item.name}::${item.language}` === selectedTemplateKey,
  );
  const approvedTemplates = templates.filter(
    (item) => String(item.status).toUpperCase() === "APPROVED",
  );
  const bodyComponent = selectedTemplate?.components?.find(
    (component) => component.type === "BODY",
  );
  const templateButtons = selectedTemplate?.components?.find((component) => component.type === "BUTTONS")?.buttons || [];
  const hasCopyCode = templateButtons.some((button) => String(button.type || "").toUpperCase() === "COPY_CODE");
  const isLimitedTimeOffer = (selectedTemplate?.components || []).some((component) => component.type === "LIMITED_TIME_OFFER");
  const bodyVariableCount = new Set(
    (bodyComponent?.text || "").match(/\{\{\d+\}\}/g) || [],
  ).size;

  useEffect(() => {
    async function loadTemplates() {
      setTemplatesLoading(true);
      setTemplatesError("");
      try {
        const response = await fetch("/api/whatsapp/templates", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.message || "Could not load Meta templates.");
        }
        const items = data.templates || [];
        setTemplates(items);
        const firstApproved = items.find(
          (item) => String(item.status).toUpperCase() === "APPROVED",
        );
        if (firstApproved) {
          const key = `${firstApproved.name}::${firstApproved.language}`;
          setSelectedTemplateKey(key);
          const firstBody = firstApproved.components?.find((item) => item.type === "BODY");
          const firstVariableCount = new Set((firstBody?.text || "").match(/\{\{\d+\}\}/g) || []).size;
          setCampaignBodyParameters(Array(firstVariableCount).fill(""));
          setForm((current) => ({
            ...current,
            templateName: firstApproved.name,
            language: firstApproved.language,
          }));
        }
      } catch (error) {
        setTemplatesError(error.message || "Could not load templates.");
      } finally {
        setTemplatesLoading(false);
      }
    }
    loadTemplates();
  }, []);

  function handleTemplateChange(key) {
    setSelectedTemplateKey(key);
    const template = templates.find(
      (item) => `${item.name}::${item.language}` === key,
    );
    setForm((current) => ({
      ...current,
      templateName: template?.name || "",
      language: template?.language || "",
      parameters: [],
      couponCode: "",
      expirationTime: "",
    }));
    const body = template?.components?.find((item) => item.type === "BODY");
    const count = new Set((body?.text || "").match(/\{\{\d+\}\}/g) || []).size;
    setCampaignBodyParameters(Array(count).fill(""));
    setCampaignCouponCode("");
    setOfferDurationHours("24");
  }

  async function createCampaignDraft(event) {
    event.preventDefault();
    setCreateLoading(true);
    setCreateResult(null);
    try {
      if (!selectedTemplate) throw new Error("Select a WhatsApp template first.");
      const audience = { type: audienceType };
      if (audienceType === "group") audience.groupId = groupId;
      if (audienceType === "tag") audience.tag = tag;

      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: campaignName,
          audience,
          template: {
            name: selectedTemplate.name,
            language: selectedTemplate.language,
          },
          bodyParameters: campaignBodyParameters.map((value) => value.trim()),
          couponCode: campaignCouponCode.trim(),
          offerDurationHours: isLimitedTimeOffer ? Number(offerDurationHours) : null,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not create campaign draft.");
      }
      setCreateResult({ success: true, message: data.message, campaign: data.campaign });
      setCampaignName("");
    } catch (error) {
      setCreateResult({ success: false, message: error.message || "Could not create campaign draft." });
    } finally {
      setCreateLoading(false);
    }
  }


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
          parameters: form.parameters.map((value) => value.trim()),
          couponCode: form.couponCode.trim(),
          expirationTime: form.expirationTime,
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


      {/* Create a campaign draft */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-green-50 p-3 text-green-600"><FileText size={22} /></div>
          <div>
            <h2 className="font-semibold">Create campaign draft</h2>
            <p className="text-xs text-slate-500">Choose a Meta-approved template for the audience selected above.</p>
          </div>
        </div>

        {templatesError && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{templatesError}</p>}

        <form onSubmit={createCampaignDraft} className="mt-5 grid gap-4 lg:grid-cols-2">
          <label className="block text-sm font-medium">
            Campaign name
            <input required maxLength={100} value={campaignName} onChange={(event) => setCampaignName(event.target.value)} placeholder="e.g. November Promotion" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-green-500" />
          </label>
          <label className="block text-sm font-medium">
            WhatsApp template
            <select required value={selectedTemplateKey} onChange={(event) => handleTemplateChange(event.target.value)} disabled={templatesLoading || approvedTemplates.length === 0} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-green-500 disabled:bg-slate-50">
              <option value="">{templatesLoading ? "Loading templates..." : "Choose an approved template"}</option>
              {templates.map((template) => {
                const approved = String(template.status).toUpperCase() === "APPROVED";
                return <option key={`${template.id || template.name}-${template.language}`} value={`${template.name}::${template.language}`} disabled={!approved}>
                  {template.name} · {template.language} · {template.status}{approved ? "" : " (not sendable)"}
                </option>;
              })}
            </select>
          </label>

          {selectedTemplate && bodyVariableCount > 0 && (
            <div className="lg:col-span-2 rounded-xl border border-green-200 bg-green-50/50 p-4">
              <h3 className="text-sm font-semibold text-slate-800">Campaign template variables</h3>
              <p className="mt-1 text-xs text-slate-500">These values will be used for every recipient in this campaign. Use a template without variables if each contact needs a different personalised value.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {Array.from({ length: bodyVariableCount }, (_, index) => (
                  <label key={index} className="block text-sm font-medium">
                    Body parameter {index + 1} {"{{" + (index + 1) + "}}"}
                    <input
                      required
                      maxLength={1024}
                      value={campaignBodyParameters[index] || ""}
                      onChange={(event) => setCampaignBodyParameters((current) => {
                        const next = [...current];
                        next[index] = event.target.value;
                        return next;
                      })}
                      placeholder={"Value for {{" + (index + 1) + "}}"}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-green-500"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          {hasCopyCode && (
            <div className="lg:col-span-2 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
              <label className="block text-sm font-semibold text-slate-800">Campaign coupon code
                <input required maxLength={isLimitedTimeOffer ? 15 : 20} value={campaignCouponCode} onChange={(event) => setCampaignCouponCode(event.target.value.replace(/\\s/g, "").slice(0, isLimitedTimeOffer ? 15 : 20))} placeholder="SAVE20" className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-green-500" />
              </label>
              <p className="mt-1 text-xs text-slate-600">This same code will be included in each recipient’s copy-code button. Use a code intended for the entire selected audience.</p>
            </div>
          )}
          {isLimitedTimeOffer && (
            <label className="lg:col-span-2 block text-sm font-medium text-slate-800">Offer validity per recipient
              <select required value={offerDurationHours} onChange={(event) => setOfferDurationHours(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-green-500 sm:max-w-xs">
                <option value="1">1 hour</option><option value="6">6 hours</option><option value="12">12 hours</option><option value="24">24 hours</option><option value="48">48 hours</option><option value="72">72 hours</option><option value="168">7 days</option>
              </select>
              <span className="mt-1 block text-xs font-normal text-slate-500">The countdown starts separately when each recipient receives the message.</span>
            </label>
          )}

          {selectedTemplate && (
            <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800">{selectedTemplate.name}</p>
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700"><CheckCircle2 size={13} /> APPROVED</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{selectedTemplate.language} · {selectedTemplate.category || "Uncategorized"}</p>
              <div className="mt-3 rounded-lg bg-white p-4">
                {(selectedTemplate.components || []).filter((item) => ["HEADER", "BODY", "FOOTER"].includes(item.type)).map((item, index) => (
                  <div key={`${item.type}-${index}`} className="mb-2 last:mb-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{item.type}</p>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.text || item.format || "Media header"}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!templatesLoading && templates.length > 0 && approvedTemplates.length === 0 && (
            <p className="lg:col-span-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Your Meta account has templates, but none are approved yet. Pending templates cannot be used for sending.</p>
          )}
          {!templatesLoading && templates.length === 0 && !templatesError && (
            <p className="lg:col-span-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">No templates were found. Create one in WhatsApp Manager first.</p>
          )}

          <div className="lg:col-span-2 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">Audience: {audiencePreview?.total ?? "Preview not run"} eligible contact(s). The server saves an opted-in recipient snapshot.</p>
            <button type="submit" disabled={createLoading || !connected || !campaignName.trim() || !selectedTemplate || (hasCopyCode && !campaignCouponCode.trim()) || (isLimitedTimeOffer && !offerDurationHours) || (audienceType === "group" && !groupId) || (audienceType === "tag" && !tag)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50">
              {createLoading ? <Loader2 size={17} className="animate-spin" /> : <FileText size={17} />}
              Create campaign draft
            </button>
          </div>
        </form>

        {createResult && (
          <div className={`mt-4 rounded-xl p-4 text-sm ${createResult.success ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
            <p className="font-medium">{createResult.message}</p>
            {createResult.success && createResult.campaign && <Link href={`/dashboard/campaigns/${createResult.campaign.id}`} className="mt-2 inline-flex font-semibold underline">Review campaign →</Link>}
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
            Approved template
            <select required value={selectedTemplateKey} onChange={(event) => handleTemplateChange(event.target.value)} disabled={templatesLoading || approvedTemplates.length === 0} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-green-500 disabled:bg-slate-50">
              <option value="">Choose approved template</option>
              {approvedTemplates.map((template) => (
                <option key={`${template.id || template.name}-${template.language}`} value={`${template.name}::${template.language}`}>
                  {template.name} · {template.language}
                </option>
              ))}
            </select>
          </label>

          {selectedTemplate && bodyVariableCount > 0 && (
            <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div>
                <p className="text-sm font-semibold text-slate-800">Template body parameters</p>
                <p className="mt-1 text-xs text-slate-500">
                  Enter a value for each variable in the approved template.
                </p>
              </div>
              {Array.from({ length: bodyVariableCount }, (_, index) => (
                <label key={index} className="block text-sm font-medium">
                  Body parameter {index + 1} {"{{" + (index + 1) + "}}"}
                  <input
                    required
                    value={form.parameters[index] || ""}
                    onChange={(event) =>
                      setForm((current) => {
                        const parameters = [...current.parameters];
                        parameters[index] = event.target.value;
                        return { ...current, parameters };
                      })
                    }
                    placeholder={"Enter value for {{" + (index + 1) + "}}"}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-green-500"
                  />
                </label>
              ))}
            </div>
          )}

          {hasCopyCode && (
            <label className="mt-4 block text-sm font-medium text-slate-700">Coupon code
              <input required maxLength={isLimitedTimeOffer ? 15 : 20} value={form.couponCode} onChange={(event) => setForm((current) => ({ ...current, couponCode: event.target.value.replace(/\\s/g, "").slice(0, isLimitedTimeOffer ? 15 : 20) }))} placeholder="SAVE20" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-green-500" />
              <span className="mt-1 block text-xs font-normal text-slate-500">This code will be shown in the copy-code button.</span>
            </label>
          )}
          {isLimitedTimeOffer && (
            <label className="mt-4 block text-sm font-medium text-slate-700">Offer expiry (your local time)
              <input required type="datetime-local" value={form.expirationTime} onChange={(event) => setForm((current) => ({ ...current, expirationTime: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-green-500" />
            </label>
          )}

          {selectedTemplate && bodyVariableCount === 0 && (
            <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
              This template has no body variables. Its approved message content will be sent as-is.
            </p>
          )}

          <button
            disabled={loading || !connected || contactCount === 0 || (hasCopyCode && !form.couponCode.trim()) || (isLimitedTimeOffer && !form.expirationTime)}
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
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div>
                    <p className="text-sm font-medium">{campaign.name}</p>
                    <p className="text-xs text-slate-400">
                      {campaign.createdAt
                        ? new Date(campaign.createdAt).toLocaleString()
                        : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs">
                      {campaign.status}
                    </span>

                    <Link
                      href={`/dashboard/campaigns/${campaign.id}`}
                      className="rounded-lg border border-green-200 px-3 py-2 text-xs font-semibold text-green-700 hover:bg-green-50"
                    >
                      Review
                    </Link>
                  </div>
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
