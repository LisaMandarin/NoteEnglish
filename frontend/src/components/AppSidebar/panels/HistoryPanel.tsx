import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { PlusOutlined } from "@ant-design/icons";
import { Tooltip } from "antd";
import { useTranslation } from "../../../context/translationContext";
import { deleteSession } from "../../../lib/api";
import { useSessionEdit } from "../hooks/useSessionEdit";
import { useSessionHistory } from "../hooks/useSessionHistory";
import SessionItem from "./SessionItem";

export default function HistoryPanel({ activePanel }: { activePanel: string }): React.ReactElement {
  const {
    state: { currentSession, sessionLoading, saving },
    actions: { loadSession, clear },
  } = useTranslation();

  const { historyItems, setHistoryItems, historyLoading, historyError } =
    useSessionHistory(activePanel);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionLoading) setPendingId(null);
  }, [sessionLoading]);

  function handleTitleUpdated(sessionId: string, trimmed: string, updatedAt?: string): void {
    setHistoryItems((prev) =>
      prev.map((s) =>
        s.id === sessionId
          ? { ...s, title: trimmed, updated_at: updatedAt ?? s.updated_at }
          : s
      )
    );
  }

  const { editingId, editValue, setEditValue, editSaving, editInputRef, startEdit, cancelEdit, confirmEdit } =
    useSessionEdit(handleTitleUpdated);

  async function handleDelete(sessionId: string, isCurrent: boolean, e: MouseEvent): Promise<void> {
    e?.stopPropagation();
    setDeletingId(sessionId);
    try {
      await deleteSession(sessionId);
      setHistoryItems((prev) => prev.filter((s) => s.id !== sessionId));
      if (isCurrent) clear();
    } finally {
      setDeletingId(null);
    }
  }

  function handleLoad(sessionId: string): void {
    setPendingId(sessionId);
    loadSession(sessionId);
  }

  const resolvedCurrentId = pendingId ?? currentSession?.id;

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
        <div className="flex items-center justify-between">
          <p className="m-0 text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
            Your Sessions
          </p>
          <Tooltip title="New session">
            <button
              onClick={clear}
              className="flex h-6 w-6 items-center justify-center rounded-full border-0 bg-transparent text-black/40 transition-colors hover:bg-black/8 hover:text-black/70 hover:cursor-pointer"
            >
              <PlusOutlined />
            </button>
          </Tooltip>
        </div>
        {saving && (
          <p className="mt-3 m-0 text-sm text-black/70">Saving current session...</p>
        )}
        {sessionLoading && (
          <p className="mt-3 m-0 text-sm text-black/70">Opening saved session...</p>
        )}
        {historyLoading && (
          <p className="mt-3 m-0 text-sm text-black/70">Loading session history...</p>
        )}
        {historyError && (
          <p className="mt-3 m-0 text-sm text-red-600">{historyError}</p>
        )}
        {!historyLoading && !historyError && historyItems.length === 0 && (
          <p className="mt-3 m-0 text-sm text-black/70">
            No saved sessions for this account yet.
          </p>
        )}
        {!historyLoading && !historyError && historyItems.length > 0 && (
          <div className="mt-3 space-y-3">
            {historyItems.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                isCurrent={session.id === resolvedCurrentId}
                sessionLoading={sessionLoading}
                saving={saving}
                deletingId={deletingId}
                editingId={editingId}
                editValue={editValue}
                setEditValue={setEditValue}
                editSaving={editSaving}
                editInputRef={editInputRef}
                onLoad={handleLoad}
                onStartEdit={startEdit}
                onCancelEdit={cancelEdit}
                onConfirmEdit={confirmEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
