"use client";

import ConversationNotes from "@/components/conversation-notes";
import { useCallback, useEffect, useRef, useState } from "react";

function formatTime(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatConversationDate(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const today = new Date();

  if (date.toDateString() === today.toDateString()) {
    return formatTime(date);
  }

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}
function getTemplateInfo(template) {
  const components = template.components || [];

  const header = components.find((component) => component.type === "HEADER");

  const body = components.find((component) => component.type === "BODY");

  const bodyText = body?.text || "";
  const buttons = components.find((component) => component.type === "BUTTONS")?.buttons || [];
  const hasCopyCode = buttons.some((button) => String(button.type || "").toUpperCase() === "COPY_CODE");
  const isLimitedTimeOffer = components.some((component) => component.type === "LIMITED_TIME_OFFER");

  const variableIndexes = [
    ...new Set(
      [...bodyText.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1])),
    ),
  ].sort((a, b) => a - b);

  let reason = "";

  if (String(template.parameter_format || "").toUpperCase() === "NAMED") {
    reason = "Named variables are not supported by the current send API.";
  } else if (
    header &&
    (header.format !== "TEXT" || /\{\{\d+\}\}/.test(header.text || ""))
  ) {
    reason = "Dynamic or media headers are not supported yet.";
  } else if (hasCopyCode && String(template.category || "").toUpperCase() !== "MARKETING") {
    reason = "Copy-code templates must use the Marketing category.";
  } else if (isLimitedTimeOffer && !hasCopyCode) {
    reason = "This limited-time offer is missing its required copy-code button.";
  } else if (variableIndexes.some((number, index) => number !== index + 1)) {
    reason = "This template has a non-sequential variable structure.";
  }

  return {
    bodyText,
    variableIndexes,
    hasCopyCode,
    isLimitedTimeOffer,
    couponCodeLimit: isLimitedTimeOffer ? 15 : 20,
    supported: !reason,
    reason,
  };
}

function getTemplatePreview(template, parameters) {
  const info = getTemplateInfo(template);

  let preview = info.bodyText;

  info.variableIndexes.forEach((number, index) => {
    preview = preview.replaceAll(
      `{{${number}}}`,
      parameters[index] || `{{${number}}}`,
    );
  });

  return preview;
}

export default function InboxPage() {
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [assignmentFilter, setAssignmentFilter] = useState("all");
  const [unreadFilter, setUnreadFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [phoneNumberFilter, setPhoneNumberFilter] = useState("all");
  const [currentUserId, setCurrentUserId] = useState("");
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [teamMembers, setTeamMembers] = useState([]);
  const [assignmentUpdating, setAssignmentUpdating] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateParameters, setTemplateParameters] = useState([]);
  const [templateCouponCode, setTemplateCouponCode] = useState("");
  const [templateOfferExpiresAt, setTemplateOfferExpiresAt] = useState("");
  const [templateSending, setTemplateSending] = useState(false);

  const bottomRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const messagesRequestIdRef = useRef(0);
  const loadedConversationIdRef = useRef("");
  const selectedConversationIdRef = useRef(selectedId);
  const loadingOlderMessagesRef = useRef(false);
  const pendingScrollAdjustmentRef = useRef(null);
  const shouldAutoScrollRef = useRef(true);
  selectedConversationIdRef.current = selectedId;
  const textareaRef = useRef(null);

  const loadConversations = useCallback(async () => {
    try {
      const response = await fetch("/api/whatsapp/conversations", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not load conversations.");
      }

      setConversations(data.conversations || []);
      setCurrentUserId(data.currentUserId || "");

      setSelectedId((currentId) => {
        if (currentId) return currentId;
        return data.conversations?.[0]?._id || "";
      });
    } catch (err) {
      setError(err.message || "Could not load conversations.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (conversationId, forceScroll = false) => {
    const requestId = ++messagesRequestIdRef.current;
    if (!conversationId) {
      shouldAutoScrollRef.current = true;
      setMessagesLoading(false);
      setHasOlderMessages(false);
      setLoadingOlderMessages(false);
      loadingOlderMessagesRef.current = false;
      loadedConversationIdRef.current = "";
      pendingScrollAdjustmentRef.current = null;
      setMessages([]);
      setSelectedConversation(null);
      return;
    }

    try {
      setMessagesLoading(true);

      const response = await fetch(
        `/api/whatsapp/conversations?conversationId=${encodeURIComponent(conversationId)}`,
        { cache: "no-store" },
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not load messages.");
      }
      if (requestId !== messagesRequestIdRef.current) return;

      const container = messagesContainerRef.current;
      const distanceFromBottom = container
        ? container.scrollHeight - container.scrollTop - container.clientHeight
        : 0;
      shouldAutoScrollRef.current = forceScroll || distanceFromBottom <= 120;

      setSelectedConversation(data.conversation);
      if (loadedConversationIdRef.current !== conversationId) {
        loadedConversationIdRef.current = conversationId;
        pendingScrollAdjustmentRef.current = null;
        setMessages(data.messages || []);
        setHasOlderMessages(data.hasMoreMessages === true);
      } else {
        // Polling and post-send refreshes merge the newest page into any older
        // pages already loaded instead of discarding the operator's history.
        setMessages((current) => {
          const byId = new Map(current.map((message) => [String(message._id), message]));
          for (const message of data.messages || []) {
            byId.set(String(message._id), message);
          }
          return [...byId.values()].sort((a, b) => {
            const timeDifference = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
            return timeDifference || String(a._id).localeCompare(String(b._id));
          });
        });
      }

      // The server resets unreadCount when this conversation is opened.
      setConversations((current) =>
        current.map((item) =>
          item._id === conversationId ? { ...item, unreadCount: 0 } : item,
        ),
      );
    } catch (err) {
      if (requestId === messagesRequestIdRef.current) {
        setError(err.message || "Could not load messages.");
      }
    } finally {
      if (requestId === messagesRequestIdRef.current) {
        setMessagesLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadConversations();

    const interval = setInterval(loadConversations, 8000);

    return () => clearInterval(interval);
  }, [loadConversations]);

  useEffect(() => {
    let active = true;
    fetch("/api/workspace/assignees", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (active && data.success) setTeamMembers(data.members || []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    shouldAutoScrollRef.current = true;
    if (loadedConversationIdRef.current !== selectedId) {
      loadedConversationIdRef.current = "";
      setMessages([]);
      setHasOlderMessages(false);
      pendingScrollAdjustmentRef.current = null;
    }
    loadMessages(selectedId, true);

    if (!selectedId) return;

    const interval = setInterval(() => {
      if (!loadingOlderMessagesRef.current) loadMessages(selectedId);
    }, 5000);

    return () => clearInterval(interval);
  }, [selectedId, loadMessages]);

  useEffect(() => {
    const pending = pendingScrollAdjustmentRef.current;
    const container = messagesContainerRef.current;
    if (pending && container) {
      const heightDifference = container.scrollHeight - pending.scrollHeight;
      container.scrollTop = pending.scrollTop + heightDifference;
      pendingScrollAdjustmentRef.current = null;
    }
  }, [messages]);

  useEffect(() => {
    if (!shouldAutoScrollRef.current) return;
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages]);

  async function loadOlderMessages() {
    if (
      !selectedId ||
      !hasOlderMessages ||
      loadingOlderMessagesRef.current ||
      messages.length === 0
    ) return;

    const conversationId = selectedId;
    const oldestMessage = messages[0];
    const beforeTimestamp = new Date(oldestMessage.timestamp);
    if (
      Number.isNaN(beforeTimestamp.getTime()) ||
      typeof oldestMessage._id !== "string"
    ) {
      setError("Could not determine the oldest message cursor. Refresh the conversation and try again.");
      return;
    }

    const container = messagesContainerRef.current;
    pendingScrollAdjustmentRef.current = container
      ? { scrollHeight: container.scrollHeight, scrollTop: container.scrollTop }
      : null;
    shouldAutoScrollRef.current = false;
    loadingOlderMessagesRef.current = true;
    setLoadingOlderMessages(true);
    setError("");

    try {
      const params = new URLSearchParams({
        conversationId,
        beforeTimestamp: beforeTimestamp.toISOString(),
        beforeId: oldestMessage._id,
      });
      const response = await fetch(
        `/api/whatsapp/conversations?${params.toString()}`,
        { cache: "no-store" },
      );
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not load older messages.");
      }
      if (
        selectedConversationIdRef.current !== conversationId ||
        loadedConversationIdRef.current !== conversationId
      ) return;

      const olderMessages = data.messages || [];
      setMessages((current) => {
        const existingIds = new Set(current.map((message) => String(message._id)));
        const uniqueOlderMessages = olderMessages.filter(
          (message) => !existingIds.has(String(message._id)),
        );
        return [...uniqueOlderMessages, ...current];
      });
      setHasOlderMessages(data.hasMoreMessages === true);
    } catch (err) {
      if (selectedConversationIdRef.current === conversationId) {
        pendingScrollAdjustmentRef.current = null;
        setError(err.message || "Could not load older messages.");
      }
    } finally {
      loadingOlderMessagesRef.current = false;
      setLoadingOlderMessages(false);
    }
  }

  async function handleSend(event) {
    event.preventDefault();

    const text = messageText.trim();

    if (!text || !selectedId || sending) return;

    setSending(true);
    setError("");

    try {
      const response = await fetch("/api/whatsapp/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversationId: selectedId,
          text,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        if (["MESSAGE_OUTCOME_UNKNOWN", "MESSAGE_ACCEPTED_SAVE_FAILED"].includes(data.code)) {
          // Clear the composer so an uncertain send cannot be accidentally
          // repeated by pressing Send again. The user can recompose after
          // checking the conversation and Meta delivery status.
          setMessageText("");
          await loadMessages(selectedId, true);
          await loadConversations();
          setError(data.message || "Message outcome is uncertain. Check delivery status before sending again.");
          return;
        }
        throw new Error(data.message || "Message could not be sent.");
      }

      setMessageText("");

      // Reload the conversation history to get the saved WhatsApp message.
      await loadMessages(selectedId, true);
      await loadConversations();

      textareaRef.current?.focus();
    } catch (err) {
      setError(err.message || "Message could not be sent.");
    } finally {
      setSending(false);
    }
  }

  async function openTemplateModal() {
    if (!selectedId) return;

    setError("");
    setTemplateModalOpen(true);
    setSelectedTemplate(null);
    setTemplateParameters([]);

    setTemplatesLoading(true);

    try {
      const response = await fetch("/api/whatsapp/templates", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not load templates.");
      }

      setTemplates(
        (data.templates || []).filter(
          (template) => template.status === "APPROVED",
        ),
      );
    } catch (err) {
      setError(err.message || "Could not load templates.");
      setTemplateModalOpen(false);
    } finally {
      setTemplatesLoading(false);
    }
  }

  function handleTemplateSelect(templateName, language) {
    const template = templates.find(
      (item) => item.name === templateName && item.language === language,
    );

    if (!template) return;

    setSelectedTemplate(template);

    const info = getTemplateInfo(template);

    setTemplateParameters(info.variableIndexes.map(() => ""));
    setTemplateCouponCode("");
    setTemplateOfferExpiresAt("");
  }

  async function handleTemplateSend(event) {
    event.preventDefault();

    if (!selectedTemplate || !selectedId || templateSending) return;

    const info = getTemplateInfo(selectedTemplate);

    if (!info.supported) {
      setError(info.reason);
      return;
    }

    if (templateParameters.some((value) => !value.trim())) {
      setError("Please complete all template variables.");
      return;
    }
    if (info.hasCopyCode && (!/^[A-Za-z0-9_-]{1,20}$/.test(templateCouponCode.trim()) || templateCouponCode.trim().length > info.couponCodeLimit)) {
      setError("Enter a valid coupon code of up to " + info.couponCodeLimit + " characters.");
      return;
    }
    if (info.isLimitedTimeOffer && (!templateOfferExpiresAt || new Date(templateOfferExpiresAt).getTime() <= Date.now())) {
      setError("Choose an offer expiry time in the future.");
      return;
    }

    setTemplateSending(true);
    setError("");

    try {
      const response = await fetch("/api/whatsapp/templates/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversationId: selectedId,
          templateName: selectedTemplate.name,
          language: selectedTemplate.language,
          parameters: templateParameters,
          couponCode: templateCouponCode.trim(),
          expirationTime: templateOfferExpiresAt ? new Date(templateOfferExpiresAt).toISOString() : "",
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        if (["MESSAGE_OUTCOME_UNKNOWN", "MESSAGE_ACCEPTED_SAVE_FAILED"].includes(data.code)) {
          // Close the composer to prevent an accidental duplicate send while
          // the customer or operator checks the uncertain delivery outcome.
          setTemplateModalOpen(false);
          setSelectedTemplate(null);
          setTemplateParameters([]);
          setTemplateCouponCode("");
          setTemplateOfferExpiresAt("");
          await loadMessages(selectedId, true);
          await loadConversations();
          setError(data.message || "Template outcome is uncertain. Check delivery status before sending again.");
          return;
        }
        throw new Error(data.message || "Template could not be sent.");
      }

      setTemplateModalOpen(false);
      setSelectedTemplate(null);
      setTemplateParameters([]);
      setTemplateCouponCode("");
      setTemplateOfferExpiresAt("");

      await loadMessages(selectedId, true);
      await loadConversations();
    } catch (err) {
      setError(err.message || "Template could not be sent.");
    } finally {
      setTemplateSending(false);
    }
  }

  const businessLines = [...new Map(
    conversations
      .filter((conversation) => conversation.phoneNumberId)
      .map((conversation) => [
        conversation.phoneNumberId,
        {
          phoneNumberId: conversation.phoneNumberId,
          label: conversation.businessPhoneNumber || conversation.businessName || conversation.phoneNumberId,
        },
      ]),
  ).values()];

  const filteredConversations = conversations.filter((conversation) => {
    const searchText = search.trim().toLowerCase();
    const status = conversation.status || "open";

    if (statusFilter !== "all" && status !== statusFilter) return false;
    if (assignmentFilter === "assigned" && !conversation.assigneeUserId) return false;
    if (assignmentFilter === "unassigned" && conversation.assigneeUserId) return false;
    if (assignmentFilter === "mine" && String(conversation.assigneeUserId || "") !== currentUserId) return false;
    if (unreadFilter === "unread" && !(conversation.unreadCount > 0)) return false;
    if (priorityFilter === "high" && conversation.priority !== "high") return false;
    if (priorityFilter === "normal" && conversation.priority === "high") return false;
    if (phoneNumberFilter !== "all" && conversation.phoneNumberId !== phoneNumberFilter) return false;
    if (!searchText) return true;

    return (
      (conversation.customerName || "").toLowerCase().includes(searchText) ||
      (conversation.waId || "").toLowerCase().includes(searchText) ||
      (conversation.lastMessagePreview || "").toLowerCase().includes(searchText)
    );
  });

  async function handleAssignConversation(assigneeUserId) {
    if (!selectedConversation || assignmentUpdating) return;
    setAssignmentUpdating(true);
    setError("");

    try {
      const response = await fetch("/api/whatsapp/conversations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: selectedConversation._id,
          assigneeUserId: assigneeUserId || null,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not assign conversation.");
      }

      const assignedMember = teamMembers.find((member) => member.userId === assigneeUserId);
      const assignment = {
        assigneeUserId: data.assigneeUserId ?? (assigneeUserId || null),
        assigneeName: data.assigneeName ?? assignedMember?.name ?? null,
        assigneeEmail: data.assigneeEmail ?? assignedMember?.email ?? null,
      };
      setSelectedConversation((current) => current ? { ...current, ...assignment } : current);
      setConversations((current) =>
        current.map((item) =>
          item._id === selectedConversation._id ? { ...item, ...assignment } : item,
        ),
      );
    } catch (err) {
      setError(err.message || "Could not assign conversation.");
    } finally {
      setAssignmentUpdating(false);
    }
  }

  async function toggleConversationPriority() {
    if (!selectedConversation) return;
    const nextPriority = selectedConversation.priority === "high" ? "normal" : "high";
    setError("");

    try {
      const response = await fetch("/api/whatsapp/conversations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: selectedConversation._id, priority: nextPriority }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Could not update priority.");

      setSelectedConversation((current) => current ? { ...current, priority: data.priority } : current);
      setConversations((current) => current.map((item) =>
        item._id === selectedConversation._id ? { ...item, priority: data.priority } : item,
      ));
    } catch (err) {
      setError(err.message || "Could not update priority.");
    }
  }

  async function toggleConversationStatus() {
    if (!selectedConversation || statusUpdating) return;
    const nextStatus =
      (selectedConversation.status || "open") === "closed" ? "open" : "closed";
    setStatusUpdating(true);
    setError("");

    try {
      const response = await fetch("/api/whatsapp/conversations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: selectedConversation._id,
          status: nextStatus,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not update conversation.");
      }

      setSelectedConversation((current) =>
        current ? { ...current, status: nextStatus } : current,
      );
      setConversations((current) =>
        current.map((item) =>
          item._id === selectedConversation._id
            ? { ...item, status: nextStatus }
            : item,
        ),
      );
    } catch (err) {
      setError(err.message || "Could not update conversation.");
    } finally {
      setStatusUpdating(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] p-4 sm:p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">Inbox</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage your WhatsApp customer conversations.
        </p>
      </div>

      {error && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError("")}
            className="font-bold"
          >
            ×
          </button>
        </div>
      )}

      <div className="grid h-[calc(100dvh-190px)] min-h-135 grid-cols-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:grid-cols-[320px_minmax(0,1fr)]">
        {/* Conversation list */}
        <aside
          className={`min-h-0 flex-col border-r border-slate-200 ${
            selectedId ? "hidden md:flex" : "flex"
          }`}
        >
          <div className="border-b border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Conversations</h2>
              <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                {conversations.length}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
              {[
                { value: "all", label: "All" },
                { value: "open", label: "Open" },
                { value: "closed", label: "Closed" },
              ].map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setStatusFilter(filter.value)}
                  className={`rounded-lg px-2 py-2 text-xs font-semibold transition ${
                    statusFilter === filter.value
                      ? "bg-white text-green-700 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {filter.label}
                  {filter.value === "all"
                    ? ` (${conversations.length})`
                    : ` (${conversations.filter((item) => (item.status || "open") === filter.value).length})`}
                </button>
              ))}
            </div>

            <select
              value={assignmentFilter}
              onChange={(event) => setAssignmentFilter(event.target.value)}
              aria-label="Filter by assignment"
              className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
            >
              <option value="all">All assignments</option>
              <option value="assigned">Assigned</option>
              <option value="unassigned">Unassigned</option>
              <option value="mine">Assigned to me</option>
            </select>

            {businessLines.length > 1 && (
              <select
                value={phoneNumberFilter}
                onChange={(event) => setPhoneNumberFilter(event.target.value)}
                aria-label="Filter by WhatsApp business number"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
              >
                <option value="all">All business numbers</option>
                {businessLines.map((line) => (
                  <option key={line.phoneNumberId} value={line.phoneNumberId}>
                    {line.label} ({conversations.filter((item) => item.phoneNumberId === line.phoneNumberId).length})
                  </option>
                ))}
              </select>
            )}

            <select
              value={unreadFilter}
              onChange={(event) => setUnreadFilter(event.target.value)}
              aria-label="Filter by unread status"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
            >
              <option value="all">All messages</option>
              <option value="unread">Unread only</option>
            </select>

            <select
              value={priorityFilter}
              onChange={(event) => setPriorityFilter(event.target.value)}
              aria-label="Filter by priority"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
            >
              <option value="all">All priorities</option>
              <option value="high">High priority</option>
              <option value="normal">Normal priority</option>
            </select>

            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search conversations..."
              className="mt-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-6 text-center text-sm text-slate-500">
                Loading conversations...
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-xl">
                  <span>💬</span>
                </div>
                <p className="font-medium text-slate-700">
                  No conversations yet
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  When someone sends a WhatsApp message to your connected
                  number, the conversation will appear here.
                </p>
              </div>
            ) : (
              filteredConversations.map((conversation) => {
                const active = selectedId === conversation._id;

                return (
                  <button
                    key={conversation._id}
                    type="button"
                    onClick={() => {
                      setError("");
                      setSelectedId(conversation._id);
                    }}
                    className={`flex w-full items-start gap-3 border-b border-slate-100 p-4 text-left transition hover:bg-slate-50 ${
                      active ? "bg-green-50" : "bg-white"
                    }`}
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-100 font-semibold text-green-700">
                      {(conversation.customerName || "?")
                        .trim()
                        .charAt(0)
                        .toUpperCase()}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {conversation.customerName || conversation.waId}
                        </p>
                        <span className="shrink-0 text-[11px] text-slate-400">
                          {formatConversationDate(conversation.lastMessageAt)}
                        </span>
                      </div>

                      <div className="mt-1 flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                          {conversation.priority === "high" && (
                            <span className="shrink-0 rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-rose-700">Priority</span>
                          )}
                          <p className="truncate text-xs text-slate-500">
                          {conversation.lastMessagePreview || "No messages"}
                          </p>
                        </div>

                        {conversation.unreadCount > 0 && (
                          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-green-600 px-1.5 text-[10px] font-bold text-white">
                            {conversation.unreadCount}
                          </span>
                        )}
                      </div>

                      <p className={`mt-1 truncate text-[10px] font-medium ${conversation.assigneeName ? "text-indigo-600" : "text-slate-400"}`}>
                        {conversation.assigneeName
                          ? `Assigned to ${conversation.assigneeName}`
                          : "Unassigned"}
                      </p>
                      {conversation.businessPhoneNumber && (
                        <p className="mt-1 truncate text-[10px] text-slate-400">
                          Business line · {conversation.businessPhoneNumber}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Chat panel */}
        <section
          className={`min-h-0 min-w-0 flex-col ${
            selectedId ? "flex" : "hidden md:flex"
          }`}
        >
          {!selectedId ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50 text-3xl">
                💬
              </div>
              <h3 className="text-lg font-semibold text-slate-800">
                Your WhatsApp inbox
              </h3>
              <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
                Select a conversation to read messages and reply to your
                customers.
              </p>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
                <button
                  type="button"
                  onClick={() => setSelectedId("")}
                  className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 md:hidden"
                  aria-label="Back to conversations"
                >
                  ←
                </button>

                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 font-semibold text-green-700">
                  {(selectedConversation?.customerName || "?")
                    .trim()
                    .charAt(0)
                    .toUpperCase()}
                </div>

                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-slate-900">
                    {selectedConversation?.customerName || "WhatsApp customer"}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {selectedConversation?.waId || ""}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Business line · {selectedConversation?.businessPhoneNumber || selectedConversation?.phoneNumberId || "Unknown"}
                  </p>
                </div>

                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleConversationPriority}
                    disabled={!selectedConversation}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:opacity-50 ${selectedConversation?.priority === "high" ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                  >
                    {selectedConversation?.priority === "high" ? "★ High priority" : "☆ Mark priority"}
                  </button>
                  {currentUserId && selectedConversation && !selectedConversation.assigneeUserId && (
                    <button
                      type="button"
                      onClick={() => handleAssignConversation(currentUserId)}
                      disabled={assignmentUpdating}
                      className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-50"
                    >
                      {assignmentUpdating ? "Assigning..." : "Assign to me"}
                    </button>
                  )}
                  {teamMembers.length > 0 && (
                    <label className="hidden items-center gap-2 text-xs text-slate-500 lg:flex">
                      <span>Assigned to</span>
                      <select
                        value={selectedConversation?.assigneeUserId?.toString?.() || ""}
                        onChange={(event) => handleAssignConversation(event.target.value)}
                        disabled={assignmentUpdating}
                        className="max-w-40 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-medium text-slate-700 outline-none focus:border-green-500 disabled:opacity-60"
                        aria-label="Assign conversation to team member"
                      >
                        <option value="">Unassigned</option>
                        {teamMembers.map((member) => (
                          <option key={member.userId} value={member.userId}>
                            {member.name} · {member.role}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <span className={`hidden rounded-full px-2.5 py-1 text-[11px] font-semibold sm:inline-flex ${
                    (selectedConversation?.status || "open") === "closed"
                      ? "bg-slate-100 text-slate-600"
                      : "bg-green-50 text-green-700"
                  }`}>
                    {(selectedConversation?.status || "open") === "closed" ? "Closed" : "Open"}
                  </span>
                  <button
                    type="button"
                    onClick={toggleConversationStatus}
                    disabled={statusUpdating || !selectedConversation}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    {statusUpdating
                      ? "Saving..."
                      : (selectedConversation?.status || "open") === "closed"
                        ? "Reopen"
                        : "Close"}
                  </button>
                </div>
              </div>

              <ConversationNotes conversationId={selectedId} />

              {/* Messages */}
              <div
                ref={messagesContainerRef}
                onScroll={(event) => {
                  const element = event.currentTarget;
                  shouldAutoScrollRef.current =
                    element.scrollHeight - element.scrollTop - element.clientHeight <= 120;
                }}
                className="min-h-0 flex-1 overflow-y-auto bg-[#f7f8f5] px-3 py-5 sm:px-6"
              >
                {messagesLoading && messages.length === 0 ? (
                  <div className="py-10 text-center text-sm text-slate-500">
                    Loading messages...
                  </div>
                ) : messages.length === 0 ? (
                  <div className="py-10 text-center text-sm text-slate-500">
                    No messages in this conversation.
                  </div>
                ) : (
                  <div className="mx-auto flex max-w-3xl flex-col gap-3">
                    {hasOlderMessages && (
                      <div className="flex justify-center pb-2">
                        <button
                          type="button"
                          onClick={loadOlderMessages}
                          disabled={loadingOlderMessages}
                          className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                        >
                          {loadingOlderMessages ? "Loading older messages..." : "Load older messages"}
                        </button>
                      </div>
                    )}
                    {messages.map((message) => {
                      const outbound = message.direction === "outbound";
                      const isTemplate = message.type === "template";

                      const templateName = message.templateName
                        ? message.templateName.replaceAll("_", " ")
                        : "WhatsApp Template";

                      const status = message.status;

                      return (
                        <div
                          key={message._id}
                          className={`flex ${
                            outbound ? "justify-end" : "justify-start"
                          }`}
                        >
                          <div
                            className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-sm sm:max-w-[75%] ${
                              outbound
                                ? "rounded-br-md bg-[#dcf8c6] text-slate-800"
                                : "rounded-bl-md border border-slate-100 bg-white text-slate-800"
                            }`}
                          >
                            {/* Template information */}
                            {isTemplate && (
                              <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-slate-300/50 pb-2">
                                <span className="rounded-md bg-blue-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-700">
                                  Template
                                </span>

                                <span className="text-xs font-semibold capitalize text-slate-600">
                                  {templateName}
                                </span>

                                {message.templateLanguage && (
                                  <span className="text-[10px] text-slate-400">
                                    {message.templateLanguage}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Other media/message types */}
                            {!isTemplate && message.type !== "text" && (
                              <p className="mb-1 text-xs font-semibold capitalize text-slate-500">
                                {message.type || "Message"}
                              </p>
                            )}

                            {/* Message content */}
                            <p className="whitespace-pre-wrap wrap-break-words text-sm leading-6">
                              {message.text ||
                                (message.type === "image"
                                  ? "📷 Image"
                                  : message.type === "audio"
                                    ? "🎵 Audio"
                                    : message.type === "video"
                                      ? "🎬 Video"
                                      : message.type === "document"
                                        ? "📎 Document"
                                        : isTemplate
                                          ? "WhatsApp template message"
                                          : `[${message.type || "Message"}]`)}
                            </p>

                            {/* Timestamp and delivery status */}
                            <div className="mt-1 flex items-center justify-end gap-1.5">
                              <span className="text-[10px] text-slate-500">
                                {formatTime(message.timestamp)}
                              </span>

                              {outbound && (
                                <span
                                  className={`text-[10px] font-medium ${
                                    status === "read"
                                      ? "text-blue-500"
                                      : status === "failed"
                                        ? "text-red-500"
                                        : "text-slate-500"
                                  }`}
                                  title={
                                    status === "read"
                                      ? "Read"
                                      : status === "delivered"
                                        ? "Delivered"
                                        : status === "failed"
                                          ? "Failed"
                                          : "Sent"
                                  }
                                >
                                  {status === "read"
                                    ? "✓✓"
                                    : status === "delivered"
                                      ? "✓✓"
                                      : status === "failed"
                                        ? "Failed"
                                        : "✓"}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    <div ref={bottomRef} />
                  </div>
                )}
              </div>

              {/* Composer */}
              <form
                onSubmit={handleSend}
                className="border-t border-slate-200 bg-white p-3 sm:p-4"
              >
                <div className="mx-auto flex max-w-3xl flex-wrap items-end gap-2">
                  <button
                    type="button"
                    onClick={openTemplateModal}
                    className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 text-sm font-semibold text-green-700 transition hover:bg-green-100"
                  >
                    <span>▤</span>
                    Template
                  </button>
                  <textarea
                    ref={textareaRef}
                    value={messageText}
                    onChange={(event) => setMessageText(event.target.value)}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        !event.shiftKey &&
                        !event.nativeEvent.isComposing
                      ) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    rows={1}
                    maxLength={4096}
                    placeholder="Type a message..."
                    className="max-h-32 min-h-11 flex-1 resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-green-500 focus:bg-white focus:ring-2 focus:ring-green-100"
                  />

                  <button
                    type="submit"
                    disabled={!messageText.trim() || sending}
                    className="flex h-11 shrink-0 items-center justify-center rounded-xl bg-green-600 px-5 text-sm font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {sending ? "Sending..." : "Send"}
                  </button>
                </div>

                <p className="mx-auto mt-2 max-w-3xl text-[11px] text-slate-400">
                  Press Enter to send · Shift + Enter for a new line
                </p>
              </form>
            </>
          )}
        </section>
      </div>
      {templateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-slate-200 p-5">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  WhatsApp Templates
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Choose an approved template to send.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setTemplateModalOpen(false)}
                className="rounded-lg px-3 py-1 text-2xl text-slate-400 hover:bg-slate-100"
              >
                ×
              </button>
            </div>

            <div className="space-y-5 p-5">
              {/* Loading */}
              {templatesLoading ? (
                <div className="py-10 text-center text-sm text-slate-500">
                  Loading approved templates...
                </div>
              ) : (
                <>
                  {/* Template selector */}
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Select template
                    </label>

                    <select
                      value={
                        selectedTemplate
                          ? `${selectedTemplate.name}|${selectedTemplate.language}`
                          : ""
                      }
                      onChange={(event) => {
                        const [name, language] = event.target.value.split("|");

                        if (name && language) {
                          handleTemplateSelect(name, language);
                        } else {
                          setSelectedTemplate(null);
                          setTemplateParameters([]);
                        }
                      }}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
                    >
                      <option value="">Choose a template...</option>

                      {templates.map((template) => (
                        <option
                          key={`${template.name}-${template.language}`}
                          value={`${template.name}|${template.language}`}
                        >
                          {template.name} ({template.language})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Selected template */}
                  {selectedTemplate &&
                    (() => {
                      const info = getTemplateInfo(selectedTemplate);

                      return (
                        <div className="space-y-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                              {selectedTemplate.status}
                            </span>

                            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                              {selectedTemplate.category}
                            </span>

                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                              {selectedTemplate.language}
                            </span>
                          </div>

                          {/* Unsupported template */}
                          {!info.supported ? (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                              <p className="font-semibold">
                                This template needs additional support.
                              </p>
                              <p className="mt-1">{info.reason}</p>
                            </div>
                          ) : (
                            <>
                              {/* Template body */}
                              <div>
                                <label className="mb-2 block text-sm font-semibold text-slate-700">
                                  Template content
                                </label>

                                <div className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                                  {info.bodyText || "No text body available."}
                                </div>
                              </div>

                              {/* Dynamic variable inputs */}
                              {info.variableIndexes.length > 0 && (
                                <div>
                                  <h3 className="mb-3 text-sm font-semibold text-slate-800">
                                    Fill in template variables
                                  </h3>

                                  <div className="space-y-3">
                                    {info.variableIndexes.map(
                                      (number, index) => (
                                        <div key={number}>
                                          <label className="mb-1.5 block text-sm font-medium text-slate-700">
                                            Variable {`{{${number}}}`}
                                          </label>

                                          <input
                                            type="text"
                                            required
                                            value={
                                              templateParameters[index] || ""
                                            }
                                            onChange={(event) => {
                                              const value = event.target.value;

                                              setTemplateParameters((current) =>
                                                current.map(
                                                  (item, itemIndex) =>
                                                    itemIndex === index
                                                      ? value
                                                      : item,
                                                ),
                                              );
                                            }}
                                            placeholder={`Enter value for {{${number}}}`}
                                            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
                                          />
                                        </div>
                                      ),
                                    )}
                                  </div>
                                </div>
                              )}

                              {info.hasCopyCode && (
                                <label className="block text-sm font-medium text-slate-700">Coupon code
                                  <input required maxLength={info.couponCodeLimit} value={templateCouponCode} onChange={(event) => setTemplateCouponCode(event.target.value.replace(/\s/g, "").slice(0, info.couponCodeLimit))} placeholder="SAVE20" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-green-500" />
                                  <span className="mt-1 block text-xs font-normal text-slate-500">This code will appear in WhatsApp’s copy-code button. Maximum {info.couponCodeLimit} characters.</span>
                                </label>
                              )}
                              {info.isLimitedTimeOffer && (
                                <label className="block text-sm font-medium text-slate-700">Offer expiry (your local time)
                                  <input required type="datetime-local" value={templateOfferExpiresAt} onChange={(event) => setTemplateOfferExpiresAt(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-green-500" />
                                  <span className="mt-1 block text-xs font-normal text-slate-500">Meta receives this as a Unix timestamp in milliseconds.</span>
                                </label>
                              )}

                              {/* Live preview */}
                              <div>
                                <h3 className="mb-2 text-sm font-semibold text-slate-800">
                                  Message preview
                                </h3>

                                <div className="rounded-xl border border-green-200 bg-[#dcf8c6] p-4">
                                  {info.isLimitedTimeOffer && <p className="mb-2 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">Limited-time offer</p>}
                                  <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">
                                    {getTemplatePreview(
                                      selectedTemplate,
                                      templateParameters,
                                    )}
                                  </p>
                                </div>
                              </div>

                              {/* Send */}
                              <button
                                type="button"
                                onClick={handleTemplateSend}
                                disabled={
                                  templateSending ||
                                  templateParameters.some((value) => !value.trim()) ||
                                  (info.hasCopyCode && !templateCouponCode.trim()) ||
                                  (info.isLimitedTimeOffer && !templateOfferExpiresAt)
                                }
                                className="w-full rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {templateSending
                                  ? "Sending template..."
                                  : "Send WhatsApp Template"}
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })()}

                  {!selectedTemplate && templates.length === 0 && (
                    <div className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">
                      No approved templates were found for this WhatsApp
                      account.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
