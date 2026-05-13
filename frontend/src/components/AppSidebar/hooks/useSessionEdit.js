import { useRef, useState } from "react";
import { updateSessionTitle } from "../../../lib/api";

export function useSessionEdit(onTitleUpdated) {
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const editInputRef = useRef(null);

  function startEdit(sessionId, currentTitle, e) {
    e?.stopPropagation();
    setEditingId(sessionId);
    setEditValue(currentTitle);
    setTimeout(() => editInputRef.current?.focus(), 0);
  }

  function cancelEdit(e) {
    e?.stopPropagation();
    setEditingId(null);
    setEditValue("");
  }

  async function confirmEdit(sessionId, currentTitle, e) {
    e?.stopPropagation();
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === currentTitle) { cancelEdit(); return; }
    setEditSaving(true);
    try {
      const updated = await updateSessionTitle(sessionId, trimmed);
      onTitleUpdated(sessionId, trimmed, updated?.updated_at);
    } finally {
      setEditSaving(false);
      setEditingId(null);
      setEditValue("");
    }
  }

  return {
    editingId,
    editValue,
    setEditValue,
    editSaving,
    editInputRef,
    startEdit,
    cancelEdit,
    confirmEdit,
  };
}
