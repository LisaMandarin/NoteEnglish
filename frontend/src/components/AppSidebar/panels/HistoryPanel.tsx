import { useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { FolderAddOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { Input, Modal, Tooltip, message } from "antd";
import { useTranslation } from "../../../context/translationContext";
import {
  createSessionGroup,
  deleteSession,
  deleteSessionGroup,
  renameSessionGroup,
  setSessionGroup,
} from "../../../lib/api";
import type { SessionGroup, SessionRecord } from "../../../types";
import { useSessionEdit } from "../hooks/useSessionEdit";
import { useSessionHistory } from "../hooks/useSessionHistory";
import SessionItem from "./SessionItem";
import SessionGroupSection from "./SessionGroupSection";
import ShareModal from "./ShareModal";

const UNGROUPED = "__ungrouped__";

type GroupModalState =
  | { open: false }
  | { open: true; mode: "create"; forSessionId: string | null }
  | { open: true; mode: "rename"; groupId: string };

export default function HistoryPanel({ activePanel, onShowTranslate }: { activePanel: string; onShowTranslate: () => void }): React.ReactElement {
  const {
    state: { currentSession, sessionLoading, saving },
    actions: { loadSession, clear, updateCurrentSessionTitle },
  } = useTranslation();

  const { historyItems, setHistoryItems, groups, setGroups, historyLoading, historyError, refresh } =
    useSessionHistory(activePanel);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [loadedFromHistory, setLoadedFromHistory] = useState(false);
  const [shareSessionId, setShareSessionId] = useState<string | null>(null);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [groupModal, setGroupModal] = useState<GroupModalState>({ open: false });
  const [groupName, setGroupName] = useState("");
  const [groupSaving, setGroupSaving] = useState(false);

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

  function handleShare(sessionId: string, e: MouseEvent): void {
    e?.stopPropagation();
    setShareSessionId(sessionId);
  }

  function handleShareTokenChange(sessionId: string, token: string | null): void {
    setHistoryItems((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, share_token: token } : s))
    );
  }

  // ── Group assignment & management ──────────────────────────────────────────

  async function handleAssignGroup(sessionId: string, groupId: string | null): Promise<void> {
    const prev = historyItems.find((s) => s.id === sessionId)?.group_id ?? null;
    if (prev === groupId) return;
    // Optimistic: re-bucket immediately, roll back on failure.
    setHistoryItems((items) =>
      items.map((s) => (s.id === sessionId ? { ...s, group_id: groupId } : s))
    );
    try {
      await setSessionGroup(sessionId, groupId);
      const name = groupId ? groups.find((g) => g.id === groupId)?.name : null;
      message.success(name ? `已移至主題「${name}」` : "已移出主題");
    } catch {
      setHistoryItems((items) =>
        items.map((s) => (s.id === sessionId ? { ...s, group_id: prev } : s))
      );
      message.error("移動失敗，請稍後再試。");
    }
  }

  function openCreateGroup(forSessionId: string | null): void {
    setGroupName("");
    setGroupModal({ open: true, mode: "create", forSessionId });
  }

  function openRenameGroup(group: SessionGroup): void {
    setGroupName(group.name);
    setGroupModal({ open: true, mode: "rename", groupId: group.id });
  }

  async function submitGroupModal(): Promise<void> {
    if (!groupModal.open) return;
    const name = groupName.trim();
    if (!name) return;
    setGroupSaving(true);
    try {
      if (groupModal.mode === "create") {
        const created = await createSessionGroup(name);
        setGroups((prev) => [...prev, created]);
        if (groupModal.forSessionId) {
          await handleAssignGroup(groupModal.forSessionId, created.id);
        }
      } else {
        const updated = await renameSessionGroup(groupModal.groupId, name);
        setGroups((prev) => prev.map((g) => (g.id === updated.id ? { ...g, name: updated.name } : g)));
      }
      setGroupModal({ open: false });
    } catch {
      message.error("操作失敗，請稍後再試。");
    } finally {
      setGroupSaving(false);
    }
  }

  function handleDeleteGroup(group: SessionGroup): void {
    Modal.confirm({
      title: `刪除主題「${group.name}」？`,
      content: "主題內的學習紀錄不會被刪除，會退回未分組。",
      okText: "刪除主題",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          await deleteSessionGroup(group.id);
          setGroups((prev) => prev.filter((g) => g.id !== group.id));
          setHistoryItems((prev) =>
            prev.map((s) => (s.group_id === group.id ? { ...s, group_id: null } : s))
          );
        } catch {
          message.error("刪除失敗，請稍後再試。");
        }
      },
    });
  }

  function toggleCollapse(id: string): void {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const resolvedCurrentId = loadedFromHistory ? (pendingId ?? currentSession?.id) : pendingId;

  // Bucket sessions by group; the API already orders groups by sort_order.
  const { byGroup, ungrouped } = useMemo(() => {
    const map = new Map<string, SessionRecord[]>();
    const rest: SessionRecord[] = [];
    for (const s of historyItems) {
      const gid = s.group_id ?? null;
      if (gid && groups.some((g) => g.id === gid)) {
        const list = map.get(gid) ?? [];
        list.push(s);
        map.set(gid, list);
      } else {
        rest.push(s);
      }
    }
    return { byGroup: map, ungrouped: rest };
  }, [historyItems, groups]);

  function renderSessionItem(session: SessionRecord): React.ReactElement {
    return (
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
        onShare={handleShare}
        groups={groups}
        onAssignGroup={handleAssignGroup}
        onCreateGroupForSession={(sessionId) => openCreateGroup(sessionId)}
      />
    );
  }

  const hasGroups = groups.length > 0;

  return (
    <>
      <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-(--accent)">
        歷史學習紀錄
      </p>
      <h2 className="mb-4 text-3xl leading-tight">開啟過去的學習紀錄</h2>
      <p className="m-0 text-base text-black/70">
        點按學習紀錄可以查詢之前的文章、翻譯和查詢的單詞。用主題把相關的文章歸類在一起。
      </p>
      <div className="mt-6 rounded-3xl border border-black/10 bg-white/70 p-4">
        <div className="flex items-center justify-between">
          <p className="m-0 text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
            你的學習紀錄
          </p>
          <div className="flex items-center gap-1">
            <Tooltip title="新增主題">
              <button
                onClick={() => openCreateGroup(null)}
                aria-label="新增主題"
                className="flex h-6 w-6 items-center justify-center rounded-full border-0 bg-transparent text-black/40 transition-colors hover:bg-black/8 hover:text-black/70 hover:cursor-pointer"
              >
                <FolderAddOutlined />
              </button>
            </Tooltip>
            <Tooltip title="重新整理">
              <button
                onClick={refresh}
                disabled={historyLoading}
                aria-label="重新整理"
                className="flex h-6 w-6 items-center justify-center rounded-full border-0 bg-transparent text-black/40 transition-colors hover:bg-black/8 hover:text-black/70 hover:cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ReloadOutlined spin={historyLoading} />
              </button>
            </Tooltip>
            <Tooltip title="新增學習記錄">
              <button
                onClick={() => { clear(); onShowTranslate(); }}
                aria-label="新增學習記錄"
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

        {!historyLoading && !historyError && historyItems.length > 0 && !hasGroups && (
          // No folders yet — plain flat list, unchanged from before.
          <div className="mt-3 space-y-3">
            {historyItems.map(renderSessionItem)}
          </div>
        )}

        {!historyLoading && !historyError && historyItems.length > 0 && hasGroups && (
          <div className="mt-3 space-y-4">
            {groups.map((group) => {
              const items = byGroup.get(group.id) ?? [];
              return (
                <SessionGroupSection
                  key={group.id}
                  name={group.name}
                  count={items.length}
                  collapsed={collapsed.has(group.id)}
                  onToggle={() => toggleCollapse(group.id)}
                  onRename={() => openRenameGroup(group)}
                  onDelete={() => handleDeleteGroup(group)}
                >
                  {items.length ? (
                    items.map(renderSessionItem)
                  ) : (
                    <p className="m-0 text-xs text-black/40">此主題還沒有學習紀錄。</p>
                  )}
                </SessionGroupSection>
              );
            })}
            {ungrouped.length > 0 && (
              <SessionGroupSection
                name="未分組"
                count={ungrouped.length}
                collapsed={collapsed.has(UNGROUPED)}
                onToggle={() => toggleCollapse(UNGROUPED)}
              >
                {ungrouped.map(renderSessionItem)}
              </SessionGroupSection>
            )}
          </div>
        )}
      </div>

      <ShareModal
        sessionId={shareSessionId}
        open={shareSessionId !== null}
        onClose={() => setShareSessionId(null)}
        onTokenChange={handleShareTokenChange}
      />

      <Modal
        open={groupModal.open}
        title={groupModal.open && groupModal.mode === "rename" ? "重新命名主題" : "新增主題"}
        okText={groupModal.open && groupModal.mode === "rename" ? "儲存" : "建立"}
        cancelText="取消"
        confirmLoading={groupSaving}
        okButtonProps={{ disabled: !groupName.trim() }}
        onOk={submitGroupModal}
        onCancel={() => setGroupModal({ open: false })}
        destroyOnClose
      >
        <Input
          autoFocus
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          onPressEnter={submitGroupModal}
          placeholder="主題名稱（例如：BBC 新聞、多益單字）"
          maxLength={60}
        />
      </Modal>
    </>
  );
}
