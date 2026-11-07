"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Plus,
  Search,
  Users,
  Loader2,
  Trash2,
  Phone,
  Tag,
  X,
  Save,
  Pencil,
  ShieldCheck,
} from "lucide-react";

import ContactCsvImport from "@/components/contact-csv-import";
import { showAlert, showConfirm } from "@/lib/swal";

export default function ContactsClient({
  initialContacts = [],
  initialPagination = { limit: 200, hasMore: false, nextCursor: null },
  initialTags = [],
}) {
  const [contacts, setContacts] = useState(initialContacts);
  const [pagination, setPagination] = useState(initialPagination);
  const [availableTags, setAvailableTags] = useState(initialTags);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("all");
  const skipInitialSearch = useRef(true);

  const [form, setForm] = useState({
    name: "",
    phone: "",
    tags: "",
    optedIn: false,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [tagDraft, setTagDraft] = useState([]);
  const [tagInput, setTagInput] = useState("");
  const [savingTags, setSavingTags] = useState(false);
  const [consentContact, setConsentContact] = useState(null);
  const [consentSource, setConsentSource] = useState("website_form");
  const [consentEvidence, setConsentEvidence] = useState("");
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [savingConsent, setSavingConsent] = useState(false);

  // Refresh the first page after imports, search changes, or tag filters.
  const refreshContacts = useCallback(async () => {
    setSearching(true);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (search.trim()) params.set("q", search.trim());
      if (tagFilter !== "all") params.set("tag", tagFilter);
      const response = await fetch(`/api/contacts?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not load contacts.");
      }
      setContacts(data.contacts || []);
      setPagination(data.pagination || { limit: 200, hasMore: false, nextCursor: null });
      setAvailableTags(data.availableTags || []);
    } catch (error) {
      setError(error.message || "Could not load contacts.");
    } finally {
      setSearching(false);
    }
  }, [search, tagFilter]);

  useEffect(() => {
    if (skipInitialSearch.current) {
      skipInitialSearch.current = false;
      return;
    }
    const timer = setTimeout(() => {
      refreshContacts();
    }, 250);
    return () => clearTimeout(timer);
  }, [refreshContacts]);

  async function loadMoreContacts() {
    if (!pagination.nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({
        limit: String(pagination.limit || 200),
        cursor: pagination.nextCursor,
      });
      if (search.trim()) params.set("q", search.trim());
      if (tagFilter !== "all") params.set("tag", tagFilter);
      const response = await fetch(`/api/contacts?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not load more contacts.");
      }
      setContacts((current) => [...current, ...(data.contacts || [])]);
      setPagination(data.pagination || { limit: 200, hasMore: false, nextCursor: null });
      setAvailableTags(data.availableTags || []);
    } catch (error) {
      setError(error.message || "Could not load more contacts.");
    } finally {
      setLoadingMore(false);
    }
  }

  // The server applies search and tag filters across every page.
  const filtered = contacts;

  // Add contacts
  async function addContact(event) {
    event.preventDefault();

    setLoading(true);
    setError("");
    setNotice("");

    try {
      const phoneNumbers = form.phone
        .split(/[\n,;]+/)
        .map((number) => number.trim())
        .filter(Boolean);

      if (phoneNumbers.length === 0) {
        setError("Please enter at least one phone number.");
        return;
      }

      const tags = [
        ...new Set(
          form.tags
            .split(",")
            .map((tag) => tag.trim().toLowerCase())
            .filter(Boolean),
        ),
      ];

      if (tags.length > 10) {
        setError("You can add a maximum of 10 tags.");
        return;
      }

      if (tags.some((tag) => tag.length > 30)) {
        setError("Each tag must be 30 characters or fewer.");
        return;
      }

      const response = await fetch("/api/contacts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: form.name,
          phone: phoneNumbers,
          optedIn: form.optedIn,
          tags,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Could not add contacts.");
        return;
      }

      await refreshContacts();

      setNotice(
        `${data.added ?? data.contacts?.length ?? 0} added, ` +
          `${data.duplicates ?? 0} duplicates skipped, ` +
          `${data.invalid?.length ?? 0} invalid numbers.`,
      );

      setForm({
        name: "",
        phone: "",
        tags: "",
        optedIn: false,
      });
    } catch (error) {
      console.error(error);
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // Start editing tags
  function startEditTags(contact) {
    setEditingId(contact.id);
    setTagDraft(contact.tags || []);
    setTagInput("");
  }

  // Add a tag to the editor
  async function addTag() {
    const tag = tagInput.trim().toLowerCase();

    if (!tag) return;

    if (tag.length > 30) {
      await showAlert({ title: "Tag is too long", text: "Each tag must be 30 characters or fewer.", icon: "warning" });
      return;
    }

    if (tagDraft.includes(tag)) {
      setTagInput("");
      return;
    }

    if (tagDraft.length >= 10) {
      await showAlert({ title: "Tag limit reached", text: "Maximum 10 tags allowed.", icon: "warning" });
      return;
    }

    setTagDraft((current) => [...current, tag]);
    setTagInput("");
  }

  // Save updated tags
  async function saveTags(contactId) {
    setSavingTags(true);

    try {
      const response = await fetch(`/api/contacts/${contactId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tags: tagDraft,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        await showAlert({ title: "Could not update tags", text: data.message || "Please try again.", icon: "error" });
        return;
      }

      setContacts((current) =>
        current.map((contact) =>
          contact.id === contactId ? { ...contact, tags: data.tags } : contact,
        ),
      );
      setAvailableTags((current) => [...new Set([...current, ...data.tags])].sort());

      setEditingId(null);
      setTagDraft([]);
      setTagInput("");
    } catch (error) {
      console.error(error);
      await showAlert({ title: "Network error", text: "Please check your connection and try again.", icon: "error" });
    } finally {
      setSavingTags(false);
    }
  }

  async function recordRenewedConsent() {
    if (!consentContact) return;
    setSavingConsent(true);
    try {
      const response = await fetch(`/api/contacts/${consentContact.id}/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: consentSource,
          evidence: consentEvidence,
          confirmed: consentConfirmed,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        await showAlert({ title: "Could not record consent", text: data.message || "Please try again.", icon: "error" });
        return;
      }
      setContacts((current) => current.map((contact) =>
        contact.id === consentContact.id
          ? { ...contact, optedIn: true, suppressed: false }
          : contact
      ));
      setConsentContact(null);
      setConsentEvidence("");
      setConsentConfirmed(false);
      setNotice("Fresh consent recorded. This contact is eligible for future campaigns.");
    } catch (error) {
      console.error(error);
      await showAlert({ title: "Network error", text: "Please check your connection and try again.", icon: "error" });
    } finally {
      setSavingConsent(false);
    }
  }

  // Delete contact
  async function removeContact(id) {
    if (!(await showConfirm({ title: "Delete contact?", text: "This contact will be removed from your workspace.", confirmButtonText: "Delete contact" }))) {
      return;
    }

    try {
      const response = await fetch(`/api/contacts/${id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        await showAlert({ title: "Could not delete contact", text: data.message || "Please try again.", icon: "error" });
        return;
      }

      setContacts((current) => current.filter((contact) => contact.id !== id));
    } catch {
      await showAlert({ title: "Network error", text: "Please check your connection and try again.", icon: "error" });
    }
  }

  return (
    <>
      {/* CSV Import */}
      <ContactCsvImport onImported={refreshContacts} />

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        {/* Add Contacts */}
        <form
          onSubmit={addContact}
          className="h-fit rounded-2xl border border-slate-200 bg-white p-5"
        >
          <div className="mb-5 flex items-center gap-2">
            <Plus className="text-green-600" size={19} />
            <h2 className="font-semibold">Add contacts</h2>
          </div>

          {error && (
            <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          {notice && (
            <p className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">
              {notice}
            </p>
          )}

          <label className="mb-4 block text-sm font-medium">
            Contact name
            <input
              required
              maxLength={100}
              value={form.name}
              onChange={(event) =>
                setForm({
                  ...form,
                  name: event.target.value,
                })
              }
              placeholder="Customer"
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-green-500"
            />
            <span className="mt-1 block text-xs font-normal text-slate-400">
              Multiple numbers will be named Customer 1, Customer 2, etc.
            </span>
          </label>

          <label className="mb-4 block text-sm font-medium">
            Phone numbers
            <textarea
              required
              rows={5}
              value={form.phone}
              onChange={(event) =>
                setForm({
                  ...form,
                  phone: event.target.value,
                })
              }
              placeholder={`+8801712345678
+8801812345678`}
              className="mt-2 w-full resize-y rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-green-500"
            />
            <span className="mt-1 block text-xs font-normal text-slate-400">
              Separate numbers with commas or new lines. Use international
              format.
            </span>
          </label>

          {/* Tags */}
          <label className="mb-4 block text-sm font-medium">
            Tags
            <input
              value={form.tags}
              onChange={(event) =>
                setForm({
                  ...form,
                  tags: event.target.value,
                })
              }
              placeholder="vip, customer, new-lead"
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-green-500"
            />
            <span className="mt-1 block text-xs font-normal text-slate-400">
              Separate tags with commas. Maximum 10 tags.
            </span>
          </label>

          {/* Consent */}
          <label className="mb-5 flex items-start gap-2 text-xs leading-5 text-slate-600">
            <input
              type="checkbox"
              checked={form.optedIn}
              onChange={(event) =>
                setForm({
                  ...form,
                  optedIn: event.target.checked,
                })
              }
              className="mt-1 accent-green-600"
            />

            <span>
              I confirm these contacts have explicitly opted in to receive
              WhatsApp messages from this business.
            </span>
          </label>

          <button
            type="submit"
            disabled={loading || !form.optedIn}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="animate-spin" size={17} />
            ) : (
              <Plus size={17} />
            )}

            {loading ? "Adding contacts..." : "Add contacts"}
          </button>
        </form>

        {/* Contact List */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
            <div>
              <h2 className="font-semibold">All contacts</h2>

              <p className="mt-1 text-xs text-slate-500">
                {contacts.length} contacts loaded
              </p>
            </div>

            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search contacts..."
                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-green-500 sm:w-56"
              />
            </div>
          </div>

          {/* Tag Filter */}
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-4">
            <Tag size={15} className="text-slate-400" />

            <button
              type="button"
              onClick={() => setTagFilter("all")}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                tagFilter === "all"
                  ? "bg-green-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              All tags
            </button>

            {availableTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setTagFilter(tag)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  tagFilter === tag
                    ? "bg-green-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Phone</th>
                  <th className="px-5 py-3 font-medium">Tags</th>
                  <th className="px-5 py-3 font-medium">Consent</th>
                  <th className="px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filtered.map((contact) => (
                  <tr key={contact.id} className="align-top">
                    {/* Name */}
                    <td className="px-5 py-4 font-medium">{contact.name}</td>

                    {/* Phone */}
                    <td className="px-5 py-4 text-slate-500">
                      <span className="flex items-center gap-2">
                        <Phone size={14} />
                        {contact.phone}
                      </span>
                    </td>

                    {/* Tags */}
                    <td className="min-w-48 px-5 py-4">
                      {editingId === contact.id ? (
                        <div className="min-w-44 space-y-3">
                          <div className="flex flex-wrap gap-1.5">
                            {tagDraft.map((tag) => (
                              <span
                                key={tag}
                                className="flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs text-green-700"
                              >
                                {tag}

                                <button
                                  type="button"
                                  onClick={() =>
                                    setTagDraft((current) =>
                                      current.filter((item) => item !== tag),
                                    )
                                  }
                                  className="hover:text-red-600"
                                >
                                  <X size={12} />
                                </button>
                              </span>
                            ))}
                          </div>

                          <div className="flex gap-1">
                            <input
                              value={tagInput}
                              onChange={(event) =>
                                setTagInput(event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  addTag();
                                }
                              }}
                              placeholder="Add a tag"
                              maxLength={30}
                              className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-green-500"
                            />

                            <button
                              type="button"
                              onClick={addTag}
                              className="rounded-lg bg-slate-100 px-2 text-slate-600 hover:bg-slate-200"
                            >
                              <Plus size={15} />
                            </button>
                          </div>

                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={savingTags}
                              onClick={() => saveTags(contact.id)}
                              className="flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                            >
                              {savingTags ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Save size={12} />
                              )}
                              Save
                            </button>

                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-600"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex min-w-36 flex-wrap items-center gap-1.5">
                          {(contact.tags || []).map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700"
                            >
                              {tag}
                            </span>
                          ))}

                          {(!contact.tags || contact.tags.length === 0) && (
                            <span className="text-xs text-slate-400">
                              No tags
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Consent */}
                    <td className="px-5 py-4">
                      {contact.suppressed ? (
                        <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">Opted out — blocked</span>
                      ) : contact.optedIn ? (
                        <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">Opted in</span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">Not confirmed</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        {editingId !== contact.id && (
                          <button
                            type="button"
                            onClick={() => startEditTags(contact)}
                            title="Edit tags"
                            className="text-slate-500 hover:text-green-600"
                          >
                            <Pencil size={15} />
                          </button>
                        )}

                        {(!contact.optedIn || contact.suppressed) && (
                          <button
                            type="button"
                            onClick={() => {
                              setConsentContact(contact);
                              setConsentSource("website_form");
                              setConsentEvidence("");
                              setConsentConfirmed(false);
                            }}
                            title="Record fresh consent"
                            className="flex items-center gap-1 text-xs font-medium text-green-700 hover:underline"
                          >
                            <ShieldCheck size={14} />
                            Record consent
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => removeContact(contact.id)}
                          title="Delete contact"
                          className="flex items-center gap-1 text-xs font-medium text-red-600 hover:underline"
                        >
                          <Trash2 size={14} />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filtered.length === 0 && (
              <div className="p-12 text-center text-sm text-slate-400">
                <Users className="mx-auto mb-3" size={25} />
                No contacts found.
              </div>
            )}
          </div>

          {pagination.hasMore && (
            <div className="flex justify-center border-t border-slate-100 p-4">
              <button
                type="button"
                onClick={loadMoreContacts}
                disabled={loadingMore || searching}
                className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingMore && <Loader2 size={15} className="animate-spin" />}
                {loadingMore ? "Loading contacts..." : "Load more contacts"}
              </button>
            </div>
          )}
        </section>
      {consentContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <form
            onSubmit={(event) => { event.preventDefault(); recordRenewedConsent(); }}
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="mb-4 flex items-center gap-3">
              <ShieldCheck className="text-green-600" size={22} />
              <div>
                <h3 className="font-semibold text-slate-900">Record fresh WhatsApp consent</h3>
                <p className="text-xs text-slate-500">{consentContact.name} · {consentContact.phone}</p>
              </div>
            </div>
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
              Only continue if this person gave new, explicit permission after opting out. Adding a note alone does not create consent.
            </div>
            <label className="mb-4 block text-sm font-medium text-slate-700">
              How was fresh consent received?
              <select
                value={consentSource}
                onChange={(event) => setConsentSource(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5"
              >
                <option value="website_form">Website consent form</option>
                <option value="paper_form">Signed paper form</option>
                <option value="verbal">Verbal consent</option>
                <option value="whatsapp_initiated">Customer initiated WhatsApp</option>
                <option value="other">Other documented source</option>
              </select>
            </label>
            <label className="mb-4 block text-sm font-medium text-slate-700">
              Evidence / reference
              <textarea
                required
                minLength={8}
                maxLength={500}
                rows={3}
                value={consentEvidence}
                onChange={(event) => setConsentEvidence(event.target.value)}
                placeholder="Example: Website form submitted on 4 Nov 2026; consent record #..."
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              />
              <span className="mt-1 block text-xs font-normal text-slate-400">Include a date, form reference, conversation reference, or other verifiable detail.</span>
            </label>
            <label className="mb-5 flex items-start gap-2 text-xs leading-5 text-slate-600">
              <input
                type="checkbox"
                checked={consentConfirmed}
                onChange={(event) => setConsentConfirmed(event.target.checked)}
                className="mt-1 accent-green-600"
              />
              <span>I confirm that the contact gave fresh, explicit WhatsApp consent after their previous opt-out, and that the evidence above is accurate.</span>
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConsentContact(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600">Cancel</button>
              <button type="submit" disabled={savingConsent || !consentConfirmed || consentEvidence.trim().length < 8} className="flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {savingConsent && <Loader2 size={15} className="animate-spin" />}
                {savingConsent ? "Saving..." : "Record fresh consent"}
              </button>
            </div>
          </form>
        </div>
      )}

      </div>
    </>
  );
}
