import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "../../../context/translationContext";
import { listSessionGroups, listSessions } from "../../../lib/api";
import type { SessionGroup, SessionRecord } from "../../../types";

// The grouped library view loads the whole list at once and folds it into
// topic folders client-side, so there is no offset pagination here. The cap
// mirrors the backend's /sessions limit; realistic per-user counts are far
// below it.
const LOAD_ALL_LIMIT = 500;

export function useSessionHistory(activePanel: string): {
  historyItems: SessionRecord[];
  setHistoryItems: Dispatch<SetStateAction<SessionRecord[]>>;
  groups: SessionGroup[];
  setGroups: Dispatch<SetStateAction<SessionGroup[]>>;
  historyLoading: boolean;
  historyError: string;
  refresh: () => void;
} {
  const {
    state: { currentSession },
  } = useTranslation();

  const [historyItems, setHistoryItems] = useState<SessionRecord[]>([]);
  const [groups, setGroups] = useState<SessionGroup[]>([]);
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

    async function load(): Promise<void> {
      setHistoryLoading(true);
      setHistoryError("");
      try {
        const [page, groupPage] = await Promise.all([
          listSessions(LOAD_ALL_LIMIT, 0),
          listSessionGroups(),
        ]);
        if (cancelled) return;
        setHistoryItems(page.items);
        setGroups(groupPage.items ?? []);
      } catch (error: unknown) {
        if (cancelled) return;
        setHistoryError(error instanceof Error ? error.message : "Could not load session history.");
        setHistoryItems([]);
        setGroups([]);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [activePanel, currentSession?.id, currentSession?.updatedAt, refreshCount]);

  return { historyItems, setHistoryItems, groups, setGroups, historyLoading, historyError, refresh };
}
