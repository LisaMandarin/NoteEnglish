import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { updateSessionTitle } from "../lib/api";

// Core inline title editor (view/edit toggle + trim/no-op guard + save-to-API),
// shared by the main-section title bar (directly) and the sidebar rename rows
// (via useSessionEdit, a thin per-row wrapper). The edit <Input> only mounts in
// edit mode, so `autoFocus` on it replaces any ref/focus plumbing here.
export function useTitleEdit(onSaved: (sessionId: string, title: string, updatedAt?: string) => void): {
  editing: boolean;
  value: string;
  setValue: Dispatch<SetStateAction<string>>;
  saving: boolean;
  start: (currentTitle: string) => void;
  cancel: () => void;
  confirm: (sessionId: string, currentTitle: string) => Promise<void>;
} {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  function start(currentTitle: string): void {
    setEditing(true);
    setValue(currentTitle);
  }

  function cancel(): void {
    setEditing(false);
    setValue("");
  }

  async function confirm(sessionId: string, currentTitle: string): Promise<void> {
    const trimmed = value.trim();
    if (!trimmed || trimmed === currentTitle) {
      cancel();
      return;
    }
    setSaving(true);
    try {
      const updated = await updateSessionTitle(sessionId, trimmed);
      onSaved(sessionId, trimmed, updated?.updated_at);
    } finally {
      setSaving(false);
      setEditing(false);
      setValue("");
    }
  }

  return { editing, value, setValue, saving, start, cancel, confirm };
}
