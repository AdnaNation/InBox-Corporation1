"use client";

import { useEffect, useState } from "react";
import { LockKeyhole, MessageSquareText, Send } from "lucide-react";

function formatNoteDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function ConversationNotes({ conversationId }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setNotes([]);
    setText("");
    setError("");
    setOpen(false);
  }, [conversationId]);

  useEffect(() => {
    if (!open || !conversationId) return;
    let active = true;
    setLoading(true);
    fetch(`/api/whatsapp/conversations/notes?conversationId=${encodeURIComponent(conversationId)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || "Could not load notes.");
        if (active) setNotes(data.notes || []);
      })
      .catch((err) => active && setError(err.message || "Could not load notes."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [open, conversationId]);

  async function addNote(event) {
    event.preventDefault();
    const value = text.trim();
    if (!value || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/whatsapp/conversations/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, text: value }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Could not save note.");
      setNotes((current) => [...current, data.note]);
      setText("");
    } catch (err) {
      setError(err.message || "Could not save note.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="border-b border-amber-200 bg-amber-50/70">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm font-semibold text-amber-900 hover:bg-amber-100/70"
      >
        <span className="flex items-center gap-2">
          <LockKeyhole size={15} />
          Internal notes
          <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px]">{notes.length}</span>
        </span>
        <span className="text-xs font-medium">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-amber-200 px-4 py-3">
          <p className="text-xs text-amber-800">Private to your workspace team. These notes are never sent to the customer on WhatsApp.</p>
          {loading ? (
            <p className="text-xs text-amber-800">Loading notes...</p>
          ) : notes.length === 0 ? (
            <p className="text-xs text-amber-800">No internal notes yet.</p>
          ) : (
            <div className="max-h-40 space-y-2 overflow-y-auto">
              {notes.map((note) => (
                <article key={note._id} className="rounded-lg border border-amber-200 bg-white px-3 py-2">
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-800">{note.authorName || "Team member"}</span>
                    <time className="text-[10px] text-slate-500">{formatNoteDate(note.createdAt)}</time>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{note.text}</p>
                </article>
              ))}
            </div>
          )}
          {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
          <form onSubmit={addNote} className="flex items-end gap-2">
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={2000}
              rows={2}
              placeholder="Add a private note for your team..."
              className="min-h-10 flex-1 resize-y rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-400"
            />
            <button
              type="submit"
              disabled={!text.trim() || saving}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-amber-700 px-3 text-xs font-semibold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send size={13} />
              {saving ? "Saving" : "Add note"}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
