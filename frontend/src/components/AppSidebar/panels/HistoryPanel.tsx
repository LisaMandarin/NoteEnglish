import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { Tooltip } from "antd";
import { useTranslation } from "../../../context/translationContext";
import { deleteSession } from "../../../lib/api";
import { useSessionEdit } from "../hooks/useSessionEdit";
import { useSessionHistory } from "../hooks/useSessionHistory";
import SessionItem from "./SessionItem";

export default function HistoryPanel({ activePanel, onShowTranslate }: { activePanel: string; onShowTranslate: () => void }): React.ReactElement {
  const {
    state: { currentSession, sessionLoading, saving },
    actions: { loadSession, clear, updateCurrentSessionTitle },
  } = useTranslation();

  const { historyItems, setHistoryItems, historyLoading, historyError, hasMore, loadingMore, refresh, loadMore } =
    useSessionHistory(activePanel);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [loadedFromHistory, setLoadedFromHistory] = useState(false);

  useEffect(() => {
    if (!sessionLoading) setPendingId(null);
  }, [sessionLoading]);

  useEffect(() => {
    if (activePanel !== "history") setLoadedFromHistory(false);
  }, [activePanel]);

  function handleTitleUpdated(sessionId: string, trimmed: string, updatedAt?: string): void {
    setHistoryItems((prev) =>
      prev.map((s) =>
        s.id === sessionId
          ? { ...s, title: trimmed, updated_at: updatedAt ?? s.updated_at }
          : s
      )
    );
    if (sessionId === currentSession?.id) {
      updateCurrentSessionTitle(trimmed);
    }
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
    setLoadedFromHistory(true);
    loadSession(sessionId);
    onShowTranslate();
  }

  const resolvedCurrentId = loadedFromHistory ? (pendingId ?? currentSession?.id) : pendingId;

  return (
    <>
      <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-(--accent)">
        歷史學習紀錄
      </p>
      <h2 className="mb-4 text-3xl leading-tight">開啟過去的學習紀錄</h2>
      <p className="m-0 text-base text-black/70">
        點按學習紀錄可以查詢之前的文章、翻譯和查詢的單詞。
      </p>
      <div className="mt-6 rounded-3xl border border-black/10 bg-white/70 p-4">
        <div className="flex items-center justify-between">
          <p className="m-0 text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
            你的學習紀錄
          </p>
          <div className="flex items-center gap-1">
            <Tooltip title="重新整理">
              <button
                onClick={refresh}
                disabled={historyLoading}
                className="flex h-6 w-6 items-center justify-center rounded-full border-0 bg-transparent text-black/40 transition-colors hover:bg-black/8 hover:text-black/70 hover:cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ReloadOutlined spin={historyLoading} />
              </button>
            </Tooltip>
            <Tooltip title="新增學習記錄">
              <button
                onClick={() => { clear(); onShowTranslate(); }}
                className="flex h-6 w-6 items-center justify-center rounded-full border-0 bg-transparent text-black/40 transition-colors hover:bg-black/8 hover:text-black/70 hover:cursor-pointer"
              >
                <PlusOutlined />
              </button>
            </Tooltip>
          </div>
        </div>
        {saving && (
          <p className="mt-3 m-0 text-sm text-black/70">正在儲存目前的學習紀錄⋯⋯</p>
        )}
        {sessionLoading && (
          <p className="mt-3 m-0 text-sm text-black/70">正在開啟已儲存的學習紀錄⋯⋯</p>
        )}
        {historyLoading && (
          <p className="mt-3 m-0 text-sm text-black/70">正在載入學習紀錄⋯⋯</p>
        )}
        {historyError && (
          <p className="mt-3 m-0 text-sm text-red-600">{historyError}</p>
        )}
        {!historyLoading && !historyError && historyItems.length === 0 && (
          <p className="mt-3 m-0 text-sm text-black/70">
            目前還沒有任何學習紀錄。
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
            <button
              onClick={loadMore}
              disabled={!hasMore || loadingMore}
              className="w-full rounded-2xl border-0 bg-transparent py-1.5 text-sm text-black/45 transition-colors hover:bg-black/5 hover:text-black/70 hover:cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {loadingMore ? "載入中⋯⋯" : "更多"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
