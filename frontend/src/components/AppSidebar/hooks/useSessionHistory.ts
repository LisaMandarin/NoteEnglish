import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "../../../context/translationContext";
import { listSessions } from "../../../lib/api";
import type { SessionRecord } from "../../../types";

export function useSessionHistory(activePanel: string): {
  historyItems: SessionRecord[];
  setHistoryItems: Dispatch<SetStateAction<SessionRecord[]>>;
  historyLoading: boolean;
  historyError: string;
} {
  const {
    state: { currentSession },
  } = useTranslation();

  const [historyItems, setHistoryItems] = useState<SessionRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const prevDepsRef = useRef<{ activePanel: string | undefined; sessionId: string | null | undefined }>({
    activePanel: undefined,
    sessionId: undefined,
  });

  useEffect(() => {
    const prev = prevDepsRef.current;
    const panelJustOpened = prev.activePanel !== activePanel;
    const idChanged = prev.sessionId !== (currentSession?.id ?? null);

    prevDepsRef.current = { activePanel, sessionId: currentSession?.id ?? null };

    if (activePanel !== "history") return;
    if (!panelJustOpened && idChanged) return;

    let cancelled = false;

    async function loadHistory(): Promise<void> {
      setHistoryLoading(true);
      setHistoryError("");
      try {
        const data = await listSessions();
        if (cancelled) return;
        setHistoryItems(data ?? []);
      } catch (error: unknown) {
        if (cancelled) return;
        setHistoryError(error instanceof Error ? error.message : "Could not load session history.");
        setHistoryItems([]);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }

    loadHistory();
    return () => { cancelled = true; };
  }, [activePanel, currentSession?.id, currentSession?.updatedAt]);

  return { historyItems, setHistoryItems, historyLoading, historyError };
}
