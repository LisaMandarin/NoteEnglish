import { useState } from "react";
import type { Dispatch, MouseEvent, SetStateAction } from "react";
import { useTitleEdit } from "../../../hooks/useTitleEdit";

// Sidebar variant of useTitleEdit: adds WHICH row is being edited (editingId)
// and stops click bubbling so the row's load-session click doesn't also fire.
// All trim/no-op/save semantics live in the shared hook.
export function useSessionEdit(onTitleUpdated: (sessionId: string, title: string, updatedAt?: string) => void): {
  editingId: string | null;
  editValue: string;
  setEditValue: Dispatch<SetStateAction<string>>;
  editSaving: boolean;
  startEdit: (sessionId: string, currentTitle: string, e?: MouseEvent) => void;
  cancelEdit: (e?: MouseEvent) => void;
  confirmEdit: (sessionId: string, currentTitle: string, e?: MouseEvent) => Promise<void>;
} {
  const [editingId, setEditingId] = useState<string | null>(null);
  const { value, setValue, saving, start, cancel, confirm } = useTitleEdit(onTitleUpdated);

  function startEdit(sessionId: string, currentTitle: string, e?: MouseEvent): void {
    e?.stopPropagation();
    setEditingId(sessionId);
    start(currentTitle);
  }

  function cancelEdit(e?: MouseEvent): void {
    e?.stopPropagation();
    setEditingId(null);
    cancel();
  }

  async function confirmEdit(sessionId: string, currentTitle: string, e?: MouseEvent): Promise<void> {
    e?.stopPropagation();
    try {
      await confirm(sessionId, currentTitle);
    } finally {
      setEditingId(null);
    }
  }

  return {
    editingId,
    editValue: value,
    setEditValue: setValue,
    editSaving: saving,
    startEdit,
    cancelEdit,
    confirmEdit,
  };
}
