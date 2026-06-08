import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "../../../context/translationContext";
import { listSessions } from "../../../lib/api";
import type { SessionRecord } from "../../../types";

const PAGE_SIZE = 5;

export function useSessionHistory(activePanel: string): {
  historyItems: SessionRecord[];
  setHistoryItems: Dispatch<SetStateAction<SessionRecord[]>>;
  historyLoading: boolean;
  historyError: string;
  hasMore: boolean;
  loadingMore: boolean;
  refresh: () => void;
  loadMore: () => void;
} {
  const {
    state: { currentSession },
  } = useTranslation();

  const [historyItems, setHistoryItems] = useState<SessionRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);

  const prevDepsRef = useRef<{ activePanel: string | undefined; sessionId: string | null | undefined; refreshCount: number }>({
    activePanel: undefined,
    sessionId: undefined,
    refreshCount: 0,
  });

  const refresh = useCallback(() => setRefreshCount((n) => n + 1), []);

  // Initial / refresh load — always fetches the first page
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
        const page = await listSessions(PAGE_SIZE, 0);
        if (cancelled) return;
        setHistoryItems(page.items);
        setHasMore(page.has_more);
      } catch (error: unknown) {
        if (cancelled) return;
        setHistoryError(error instanceof Error ? error.message : "Could not load session history.");
        setHistoryItems([]);
        setHasMore(false);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }

    loadHistory();
    return () => { cancelled = true; };
  }, [activePanel, currentSession?.id, currentSession?.updatedAt, refreshCount]);

  const loadMore = useCallback(async (): Promise<void> => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const page = await listSessions(PAGE_SIZE, historyItems.length);
      setHistoryItems((prev) => [...prev, ...page.items]);
      setHasMore(page.has_more);
    } catch {
      // silently ignore — user can try again
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, historyItems.length]);

  return { historyItems, setHistoryItems, historyLoading, historyError, hasMore, loadingMore, refresh, loadMore };
}
