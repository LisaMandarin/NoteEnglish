import { useEffect, useRef, useState } from "react";
import {
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  FolderOpenOutlined,
  LogoutOutlined,
  SettingOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Button } from "antd";
import { useTranslation } from "../context/translationContext";
import { formatUpdatedAt } from "../lib/formatUpdatedAt";
import { deleteSession, listSessions, updateSessionTitle } from "../lib/api";

const SIDEBAR_BUTTONS = [
  {
    key: "profile",
    ariaLabel: (username) => `${username} profile`,
    icon: UserOutlined,
  },
  {
    key: "settings",
    ariaLabel: () => "Settings",
    icon: SettingOutlined,
  },
  {
    key: "history",
    ariaLabel: () => "Session history folders",
    icon: FolderOpenOutlined,
  },
];

function SidebarPanelContent({ activePanel, username, email, onSignOut }) {
  const {
    state: { currentSession, sessionLoading, saving },
    actions: { loadSession, clear },
  } = useTranslation();
  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const editInputRef = useRef(null);
  const prevDepsRef = useRef({ activePanel: undefined, sessionId: undefined });

  useEffect(() => {
    const prev = prevDepsRef.current;
    const panelJustOpened = prev.activePanel !== activePanel;
    const idChanged = prev.sessionId !== (currentSession?.id ?? null);

    prevDepsRef.current = { activePanel, sessionId: currentSession?.id ?? null };

    if (activePanel !== "history") return;
    // Session switch (id changed) without the panel just opening → skip re-fetch
    if (!panelJustOpened && idChanged) return;

    let cancelled = false;

    async function loadHistory() {
      setHistoryLoading(true);
      setHistoryError("");

      try {
        const data = await listSessions();
        if (cancelled) return;
        setHistoryItems(data ?? []);
      } catch (error) {
        if (cancelled) return;
        setHistoryError(error?.message || "Could not load session history.");
        setHistoryItems([]);
      } finally {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      }
    }

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [activePanel, currentSession?.id, currentSession?.updatedAt]);

  if (activePanel === "profile") {
    return (
      <>
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-(--accent)">
          Welcome
        </p>
        <h2 className="mb-4 text-3xl leading-tight">Good to see you, {username}.</h2>
        <p className="m-0 text-base text-black/70">
          Use this space for quick account details, shortcuts, or status notes
          while you work through your session history.
        </p>
        <p className="mt-4 text-sm text-black/65">{email}</p>
        <Button
          icon={<LogoutOutlined aria-hidden="true" />}
          onClick={onSignOut}
          className="mt-5"
        >
          Sign out
        </Button>
      </>
    );
  }

  if (activePanel === "settings") {
    return (
      <>
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-(--accent)">
          Settings
        </p>
        <h2 className="mb-4 text-3xl leading-tight">Adjust your workspace.</h2>
        <p className="m-0 text-base text-black/70">
          Reserve this section for preferences such as translation options,
          display choices, and account configuration.
        </p>
      </>
    );
  }

  if (activePanel === "history") {
    return (
      <>
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-(--accent)">
          Session Histories
        </p>
        <h2 className="mb-4 text-3xl leading-tight">Reopen previous work.</h2>
        <p className="m-0 text-base text-black/70">
          Use this area to list saved sessions, organize folders, and jump back
          into earlier translation drafts.
        </p>
        <div className="mt-6 rounded-3xl border border-black/10 bg-white/70 p-4">
          <p className="m-0 text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
            Your Sessions
          </p>
          {saving ? (
            <p className="mt-3 m-0 text-sm text-black/70">Saving current session...</p>
          ) : null}
          {sessionLoading ? (
            <p className="mt-3 m-0 text-sm text-black/70">Opening saved session...</p>
          ) : null}
          {historyLoading ? (
            <p className="mt-3 m-0 text-sm text-black/70">Loading session history...</p>
          ) : null}
          {historyError ? (
            <p className="mt-3 m-0 text-sm text-red-600">{historyError}</p>
          ) : null}
          {!historyLoading && !historyError && historyItems.length === 0 ? (
            <p className="mt-3 m-0 text-sm text-black/70">
              No saved sessions for this account yet.
            </p>
          ) : null}
          {!historyLoading && !historyError && historyItems.length > 0 ? (
            <div className="mt-3 space-y-3">
              {historyItems.map((session) => {
                const isCurrent = session.id === currentSession?.id;
                const title =
                  session.title?.trim() ||
                  session.source_text?.trim()?.slice(0, 80) ||
                  "Untitled session";
                const isEditing = editingId === session.id;

                function startEdit(e) {
                  e.stopPropagation();
                  setEditingId(session.id);
                  setEditValue(title);
                  setTimeout(() => editInputRef.current?.focus(), 0);
                }

                function cancelEdit(e) {
                  e?.stopPropagation();
                  setEditingId(null);
                  setEditValue("");
                }

                async function confirmEdit(e) {
                  e?.stopPropagation();
                  const trimmed = editValue.trim();
                  if (!trimmed || trimmed === title) { cancelEdit(); return; }
                  setEditSaving(true);
                  try {
                    await updateSessionTitle(session.id, trimmed);
                    setHistoryItems((prev) =>
                      prev.map((s) => s.id === session.id ? { ...s, title: trimmed } : s)
                    );
                  } finally {
                    setEditSaving(false);
                    setEditingId(null);
                    setEditValue("");
                  }
                }

                async function confirmDelete(e) {
                  e?.stopPropagation();
                  setDeletingId(session.id);
                  try {
                    await deleteSession(session.id);
                    setHistoryItems((prev) => prev.filter((s) => s.id !== session.id));
                    if (isCurrent) clear();
                  } finally {
                    setDeletingId(null);
                  }
                }

                return (
                  <div
                    key={session.id}
                    className={`group relative w-full rounded-2xl border p-3 text-left transition-all duration-200 ${
                      !isCurrent && !isEditing
                        ? "hover:shadow-md hover:-translate-y-0.5 hover:border-black/20 hover:bg-white"
                        : ""
                    }`}
                    style={{
                      borderColor: isCurrent ? "var(--accent)" : "rgb(0 0 0 / 0.08)",
                      backgroundColor: isCurrent
                        ? "color-mix(in srgb, var(--accent) 10%, white)"
                        : "rgb(255 255 255 / 0.78)",
                      opacity: deletingId === session.id ? 0.5 : 1,
                    }}
                  >
                    {isEditing ? (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          ref={editInputRef}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") confirmEdit(e);
                            if (e.key === "Escape") cancelEdit(e);
                          }}
                          disabled={editSaving}
                          className="min-w-0 flex-1 rounded-lg border border-black/20 bg-white px-2 py-0.5 text-sm font-semibold text-black/85 outline-none focus:border-(--accent)"
                        />
                        <button
                          type="button"
                          onClick={confirmEdit}
                          disabled={editSaving}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-(--accent) text-white"
                        >
                          <CheckOutlined style={{ fontSize: 10 }} />
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          disabled={editSaving}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/10 text-black/60"
                        >
                          <CloseOutlined style={{ fontSize: 10 }} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => { if (!isCurrent) loadSession(session.id); }}
                          disabled={sessionLoading || saving}
                          className={`w-full pr-5 text-left ${!isCurrent && !sessionLoading && !saving ? "cursor-pointer" : "cursor-default"}`}
                        >
                          <p className="m-0 text-base font-semibold text-black/85">{title}</p>
                          <div className="mt-2 text-xs leading-tight text-black/55">
                            {formatUpdatedAt(session.updated_at)}
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={startEdit}
                          className="absolute right-2 top-2 cursor-pointer text-black/25 opacity-0 transition-opacity group-hover:opacity-100 hover:text-blue-500"
                          aria-label="Edit session title"
                        >
                          <EditOutlined style={{ fontSize: 13 }} />
                        </button>
                        <button
                          type="button"
                          onClick={confirmDelete}
                          disabled={deletingId === session.id}
                          className="absolute bottom-2 right-2 cursor-pointer text-black/25 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500"
                          aria-label="Delete session"
                        >
                          <DeleteOutlined style={{ fontSize: 13 }} />
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </>
    );
  }

  return null;
}

export default function AppSidebar({
  activePanel,
  isSidebarOpen,
  onTogglePanel,
  username,
  email,
  onSignOut,
}) {
  return (
    <aside className="flex min-h-[calc(100vh-5rem)] overflow-hidden rounded-[28px] bg-[color-mix(in_srgb,var(--accent)_16%,white)] shadow-sm">
      <div className="flex w-22 shrink-0 flex-row justify-between px-4 py-5 lg:flex-col lg:items-center">
        <div className="flex flex-row gap-3 lg:flex-col">
          {SIDEBAR_BUTTONS.map((button) => {
            const isActive = activePanel === button.key;

            return (
              <Button
                key={button.key}
                aria-label={button.ariaLabel(username)}
                aria-expanded={isActive}
                aria-controls="sidebar-panel"
                onClick={() => onTogglePanel(button.key)}
                icon={<button.icon aria-hidden="true" />}
                shape="circle"
                size="large"
                className="flex h-12 w-12 items-center justify-center border-0 text-xl shadow-sm transition"
                style={{
                  backgroundColor: isActive
                    ? "var(--accent)"
                    : "rgb(255 255 255 / 0.8)",
                  color: isActive ? "#ffffff" : "var(--accent)",
                }}
              />
            );
          })}
        </div>
      </div>

      <section
        id="sidebar-panel"
        className={`overflow-hidden transition-[max-width,max-height,padding,transform] duration-300 ${
          isSidebarOpen
            ? "max-h-80 max-w-[320px] px-6 py-8 lg:max-h-none"
            : "pointer-events-none max-h-0 max-w-0 px-0 py-0 lg:max-h-none"
        }`}
        aria-hidden={!isSidebarOpen}
      >
        <div
          className={`w-[320px] max-w-full transition-transform duration-300 ${
            isSidebarOpen ? "translate-x-0" : "-translate-x-8"
          }`}
        >
          <SidebarPanelContent
            activePanel={activePanel}
            username={username}
            email={email}
            onSignOut={onSignOut}
          />
        </div>
      </section>
    </aside>
  );
}
