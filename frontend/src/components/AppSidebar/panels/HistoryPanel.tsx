import { useEffect, useState } from "react";
import { useTranslation } from "../../../context/translationContext";
import { deleteSession } from "../../../lib/api";
import { useSessionEdit } from "../hooks/useSessionEdit";
import { useSessionHistory } from "../hooks/useSessionHistory";
import SessionItem from "./SessionItem";

export default function HistoryPanel({ activePanel }) {
  const {
    state: { currentSession, sessionLoading, saving },
    actions: { loadSession, clear },
  } = useTranslation();

  const { historyItems, setHistoryItems, historyLoading, historyError } =
    useSessionHistory(activePanel);

  const [deletingId, setDeletingId] = useState(null);
  const [pendingId, setPendingId] = useState(null);

  useEffect(() => {
    if (!sessionLoading) setPendingId(null);
  }, [sessionLoading]);

  function handleTitleUpdated(sessionId, trimmed, updatedAt) {
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

  async function handleDelete(sessionId, isCurrent, e) {
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

  function handleLoad(sessionId) {
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
        <p className="m-0 text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
          Your Sessions
        </p>
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
