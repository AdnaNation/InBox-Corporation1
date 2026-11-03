"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Users, Loader2, Trash2, Phone } from "lucide-react";
import ContactCsvImport from "@/components/contact-csv-import";

export default function ContactsClient({ initialContacts = [] }) {
  const [contacts, setContacts] = useState(initialContacts);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    name: "",
    phone: "",
    optedIn: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refreshContacts() {
    const response = await fetch("/api/contacts", {
      cache: "no-store",
    });

    const data = await response.json();

    if (response.ok) {
      setContacts(data.contacts || []);
    }
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return contacts;

    return contacts.filter((contact) =>
      `${contact.name} ${contact.phone}`.toLowerCase().includes(query),
    );
  }, [contacts, search]);

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

      const response = await fetch("/api/contacts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: form.name,
          phone: phoneNumbers,
          optedIn: form.optedIn,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Could not add contacts.");
        return;
      }

      if (data.contacts?.length) {
        setContacts((current) => {
          const existingIds = new Set(current.map((item) => item.id));

          const newContacts = data.contacts.filter(
            (item) => !existingIds.has(item.id),
          );

          return [...newContacts, ...current];
        });
      }

      setNotice(
        `${data.added ?? data.contacts?.length ?? 0} added, ` +
          `${data.duplicates ?? 0} duplicates skipped, ` +
          `${data.invalid?.length ?? 0} invalid numbers.`,
      );

      setForm({
        name: "",
        phone: "",
        optedIn: false,
      });
    } catch (error) {
      console.error(error);
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function removeContact(id) {
    if (!confirm("Are you sure you want to delete this contact?")) {
      return;
    }

    try {
      const response = await fetch(`/api/contacts/${id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.message || "Could not delete contact.");
        return;
      }

      setContacts((current) => current.filter((contact) => contact.id !== id));
    } catch {
      alert("Network error. Please try again.");
    }
  }

  return (
    <>
      <ContactCsvImport onImported={refreshContacts} />

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        {/* Add contacts */}
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
                setForm({ ...form, name: event.target.value })
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
              rows={6}
              value={form.phone}
              onChange={(event) =>
                setForm({ ...form, phone: event.target.value })
              }
              placeholder={`+8801712345678
+8801812345678
+8801912345678`}
              className="mt-2 w-full resize-y rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-green-500"
            />
            <span className="mt-1 block text-xs font-normal text-slate-400">
              Separate numbers with commas or new lines. Use international
              format.
            </span>
          </label>

          <label className="mb-5 flex items-start gap-2 text-xs leading-5 text-slate-600">
            <input
              type="checkbox"
              checked={form.optedIn}
              onChange={(event) =>
                setForm({ ...form, optedIn: event.target.checked })
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

        {/* Contact list */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
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

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Phone</th>
                  <th className="px-5 py-3 font-medium">Consent</th>
                  <th className="px-5 py-3 font-medium">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filtered.map((contact) => (
                  <tr key={contact.id}>
                    <td className="px-5 py-4 font-medium">{contact.name}</td>

                    <td className="px-5 py-4 text-slate-500">
                      <span className="flex items-center gap-2">
                        <Phone size={14} />
                        {contact.phone}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      {contact.optedIn ? (
                        <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                          Opted in
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                          Not confirmed
                        </span>
                      )}
                    </td>

                    <td className="px-5 py-4">
                      <button
                        type="button"
                        onClick={() => removeContact(contact.id)}
                        className="flex items-center gap-1 text-xs font-medium text-red-600 hover:underline"
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
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
        </section>
      </div>
    </>
  );
}
