import { useRef, useState } from "react";
import type { Dispatch, MouseEvent, RefObject, SetStateAction } from "react";
import { updateSessionTitle } from "../../../lib/api";

export function useSessionEdit(onTitleUpdated: (sessionId: string, title: string, updatedAt?: string) => void): {
  editingId: string | null;
  editValue: string;
  setEditValue: Dispatch<SetStateAction<string>>;
  editSaving: boolean;
  editInputRef: RefObject<HTMLInputElement | null>;
  startEdit: (sessionId: string, currentTitle: string, e?: MouseEvent) => void;
  cancelEdit: (e?: MouseEvent) => void;
  confirmEdit: (sessionId: string, currentTitle: string, e?: MouseEvent) => Promise<void>;
} {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [editSaving, setEditSaving] = useState(false);
  const editInputRef = useRef<HTMLInputElement | null>(null);

  function startEdit(sessionId: string, currentTitle: string, e?: MouseEvent): void {
    e?.stopPropagation();
    setEditingId(sessionId);
    setEditValue(currentTitle);
    setTimeout(() => editInputRef.current?.focus(), 0);
  }

  function cancelEdit(e?: MouseEvent): void {
    e?.stopPropagation();
    setEditingId(null);
    setEditValue("");
  }

  async function confirmEdit(sessionId: string, currentTitle: string, e?: MouseEvent): Promise<void> {
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
