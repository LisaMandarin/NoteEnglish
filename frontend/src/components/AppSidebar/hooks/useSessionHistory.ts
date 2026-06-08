import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "../../../context/translationContext";
import { listSessions } from "../../../lib/api";
import type { SessionRecord } from "../../../types";

export function useSessionHistory(activePanel: string): {
  historyItems: SessionRecord[];
  setHistoryItems: Dispatch<SetStateAction<SessionRecord[]>>;
  historyLoading: boolean;
  historyError: string;
  refresh: () => void;
} {
  const {
    state: { currentSession },
  } = useTranslation();

  const [historyItems, setHistoryItems] = useState<SessionRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [refreshCount, setRefreshCount] = useState(0);

  const prevDepsRef = useRef<{ activePanel: string | undefined; sessionId: string | null | undefined; refreshCount: number }>({
    activePanel: undefined,
    sessionId: undefined,
    refreshCount: 0,
  });

  const refresh = useCallback(() => setRefreshCount((n) => n + 1), []);

  useEffect(() => {
    const prev = prevDepsRef.current;
    const panelJustOpened = prev.activePanel !== activePanel;
    const idChanged = prev.sessionId !== (currentSession?.id ?? null);
    const manualRefresh = prev.refreshCount !== refreshCount;

    prevDepsRef.current = { activePanel, sessionId: currentSession?.id ?? null, refreshCount };

    if (activePanel !== "history") return;
    if (!manualRefresh && !panelJustOpened && idChanged) return;

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
  }, [activePanel, currentSession?.id, currentSession?.updatedAt, refreshCount]);

  return { historyItems, setHistoryItems, historyLoading, historyError, refresh };
}
