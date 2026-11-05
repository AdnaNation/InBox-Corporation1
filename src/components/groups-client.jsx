"use client";

import { showAlert, showConfirm } from "@/lib/swal";

import { useEffect, useMemo, useState } from "react";
import {
  Users,
  Plus,
  Search,
  Pencil,
  Trash2,
  X,
  Loader2,
  Save,
  UsersRound,
} from "lucide-react";

export default function GroupsClient() {
  const [groups, setGroups] = useState([]);
  const [contacts, setContacts] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [search, setSearch] = useState("");
  const [contactSearch, setContactSearch] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const [groupsResponse, contactsResponse] = await Promise.all([
        fetch("/api/groups", { cache: "no-store" }),
        fetch("/api/contacts?limit=5000", { cache: "no-store" }),
      ]);

      const [groupsData, contactsData] = await Promise.all([
        groupsResponse.json(),
        contactsResponse.json(),
      ]);

      if (!groupsResponse.ok) {
        throw new Error(groupsData.message || "Could not load groups.");
      }

      if (!contactsResponse.ok) {
        throw new Error(contactsData.message || "Could not load contacts.");
      }

      setGroups(groupsData.groups || []);
      setContacts(contactsData.contacts || []);
    } catch (error) {
      setError(error.message || "Could not load data.");
    } finally {
      setLoading(false);
    }
  }

  const filteredGroups = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return groups;

    return groups.filter((group) =>
      `${group.name} ${group.description}`.toLowerCase().includes(query),
    );
  }, [groups, search]);

  const filteredContacts = useMemo(() => {
    const query = contactSearch.trim().toLowerCase();

    if (!query) return contacts;

    return contacts.filter((contact) =>
      `${contact.name} ${contact.phone}`.toLowerCase().includes(query),
    );
  }, [contacts, contactSearch]);

  function resetForm() {
    setEditingId(null);
    setName("");
    setDescription("");
    setSelectedIds([]);
    setContactSearch("");
  }

  function startEdit(group) {
    setEditingId(group.id);
    setName(group.name);
    setDescription(group.description || "");
    setSelectedIds(group.contactIds || []);
    setContactSearch("");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function toggleContact(contactId) {
    setSelectedIds((current) =>
      current.includes(contactId)
        ? current.filter((id) => id !== contactId)
        : [...current, contactId],
    );
  }

  function selectFilteredContacts() {
    const ids = filteredContacts.map((contact) => contact.id);

    setSelectedIds((current) => [...new Set([...current, ...ids])]);
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  async function saveGroup(event) {
    event.preventDefault();

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const url = editingId ? `/api/groups/${editingId}` : "/api/groups";

      const response = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          description,
          contactIds: selectedIds,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Could not save group.");
        return;
      }

      setNotice(data.message || "Group saved successfully.");
      resetForm();
      await loadData();
    } catch (error) {
      setError(error.message || "Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteGroup(groupId) {
    const confirmed = await showConfirm({
      title: "Delete group?",
      text: "Your contacts will not be deleted.",
      confirmButtonText: "Delete group",
    });

    if (!confirmed) return;

    try {
      const response = await fetch(`/api/groups/${groupId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        await showAlert({ title: "Could not delete group", text: data.message || "Please try again.", icon: "error" });
        return;
      }

      setGroups((current) => current.filter((group) => group.id !== groupId));

      if (editingId === groupId) resetForm();
    } catch {
      await showAlert({ title: "Network error", text: "Please check your connection and try again.", icon: "error" });
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {notice && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {notice}
        </div>
      )}

      {/* Create / Edit group */}
      <form
        onSubmit={saveGroup}
        className="rounded-2xl border border-slate-200 bg-white p-5"
      >
        <div className="mb-5 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <UsersRound className="text-green-600" size={20} />
              <h2 className="font-semibold">
                {editingId ? "Edit group" : "Create a group"}
              </h2>
            </div>

            <p className="mt-1 text-xs text-slate-500">
              Organize contacts into reusable audiences.
            </p>
          </div>

          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600 hover:bg-slate-200"
            >
              <X size={14} />
              Cancel
            </button>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-medium">
            Group name
            <input
              required
              maxLength={60}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="VIP Customers"
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-green-500"
            />
          </label>

          <label className="block text-sm font-medium">
            Description
            <input
              maxLength={250}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Our most valuable customers"
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-green-500"
            />
          </label>
        </div>

        {/* Contact selection */}
        <div className="mt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Select contacts</h3>

              <p className="mt-1 text-xs text-slate-500">
                {selectedIds.length} contacts selected
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={selectFilteredContacts}
                className="rounded-lg bg-green-50 px-3 py-2 text-xs font-medium text-green-700 hover:bg-green-100"
              >
                Select visible
              </button>

              <button
                type="button"
                onClick={clearSelection}
                className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-200"
              >
                Clear selection
              </button>
            </div>
          </div>

          <div className="relative mb-3">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              value={contactSearch}
              onChange={(event) => setContactSearch(event.target.value)}
              placeholder="Search contacts by name or phone..."
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-green-500"
            />
          </div>

          <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200">
            {filteredContacts.length ? (
              filteredContacts.map((contact) => {
                const checked = selectedIds.includes(contact.id);

                return (
                  <label
                    key={contact.id}
                    className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleContact(contact.id)}
                      className="h-4 w-4 accent-green-600"
                    />

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">
                        {contact.name}
                      </span>

                      <span className="block text-xs text-slate-400">
                        {contact.phone}
                      </span>
                    </span>

                    {contact.optedIn ? (
                      <span className="rounded-full bg-green-50 px-2 py-1 text-[10px] text-green-700">
                        Opted in
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-500">
                        No consent
                      </span>
                    )}
                  </label>
                );
              })
            ) : (
              <p className="p-8 text-center text-sm text-slate-400">
                No contacts found.
              </p>
            )}
          </div>

          <p className="mt-2 text-xs text-slate-400">
            You can add up to 5,000 contacts to a group. Only contacts with
            recorded WhatsApp consent can be messaged in campaigns.
          </p>
        </div>

        <button
          type="submit"
          disabled={saving || loading}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 sm:w-auto sm:px-8"
        >
          {saving ? (
            <Loader2 size={17} className="animate-spin" />
          ) : editingId ? (
            <Save size={17} />
          ) : (
            <Plus size={17} />
          )}

          {saving ? "Saving..." : editingId ? "Save changes" : "Create group"}
        </button>
      </form>

      {/* Existing groups */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
          <div>
            <h2 className="font-semibold">Your groups</h2>
            <p className="mt-1 text-xs text-slate-500">
              {groups.length} groups
            </p>
          </div>

          <div className="relative">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search groups..."
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-green-500 sm:w-52"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-400">
            <Loader2 size={18} className="animate-spin" />
            Loading groups...
          </div>
        ) : filteredGroups.length ? (
          <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
            {filteredGroups.map((group) => (
              <div
                key={group.id}
                className="rounded-xl border border-slate-200 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="rounded-xl bg-green-50 p-3 text-green-600">
                      <Users size={20} />
                    </div>

                    <div className="min-w-0">
                      <h3 className="truncate font-semibold">{group.name}</h3>

                      <p className="mt-1 text-xs text-slate-400">
                        {group.contactCount} contacts
                      </p>
                    </div>
                  </div>

                  <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                    Group
                  </span>
                </div>

                {group.description && (
                  <p className="mt-4 line-clamp-2 text-sm text-slate-500">
                    {group.description}
                  </p>
                )}

                <div className="mt-5 flex gap-2 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => startEdit(group)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-100 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200"
                  >
                    <Pencil size={13} />
                    Edit
                  </button>

                  <button
                    type="button"
                    onClick={() => deleteGroup(group.id)}
                    className="flex items-center justify-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-100"
                  >
                    <Trash2 size={13} />
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-14 text-center">
            <UsersRound size={30} className="mx-auto mb-3 text-slate-300" />

            <p className="font-medium text-slate-700">No groups yet</p>

            <p className="mt-1 text-sm text-slate-400">
              Create your first group to organize your contacts.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
