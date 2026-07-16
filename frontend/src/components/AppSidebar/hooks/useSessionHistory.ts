import { useCallback, useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { listSessionGroups, listSessions } from "../../../lib/api";
import { onSessionTitleUpdated } from "../../../lib/sessionTitleEvent";
import type { SessionGroup, SessionRecord } from "../../../types";

// Sessions load in full (paged client-side into topic folders). We fetch in
// chunks and follow has_more so accounts with more than one page still load
// completely; the chunk cap keeps within the backend's /sessions limit and the
// page cap guards against an unbounded loop.
const FETCH_CHUNK = 200;
const MAX_CHUNKS = 100;

async function fetchAllSessions(isCancelled: () => boolean): Promise<SessionRecord[]> {
  const all: SessionRecord[] = [];
  let offset = 0;
  for (let i = 0; i < MAX_CHUNKS; i++) {
    const page = await listSessions(FETCH_CHUNK, offset);
    all.push(...page.items);
    if (!page.has_more || isCancelled()) break;
    offset += page.items.length;
  }
  return all;
}

export function useSessionHistory(activePanel: string): {
  historyItems: SessionRecord[];
  setHistoryItems: Dispatch<SetStateAction<SessionRecord[]>>;
  groups: SessionGroup[];
  setGroups: Dispatch<SetStateAction<SessionGroup[]>>;
  historyLoading: boolean;
  historyError: string;
  refresh: () => void;
} {
  const [historyItems, setHistoryItems] = useState<SessionRecord[]>([]);
  const [groups, setGroups] = useState<SessionGroup[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [refreshCount, setRefreshCount] = useState(0);

  const refresh = useCallback(() => setRefreshCount((n) => n + 1), []);

  // Load when the panel opens (mount) and on manual refresh only. Deliberately
  // NOT on the current session's updated_at: an autosave must not trigger a
  // full reload of the whole list — and its per-session proficiency
  // computation — every time a note or vocab item changes while the panel is
  // open. Local edits update their own row; the refresh button re-syncs.
  useEffect(() => {
    if (activePanel !== "history") return;

    let cancelled = false;

    async function load(): Promise<void> {
      setHistoryLoading(true);
      setHistoryError("");
      try {
        const [sessions, groupPage] = await Promise.all([
          fetchAllSessions(() => cancelled),
          listSessionGroups(),
        ]);
        if (cancelled) return;
        setHistoryItems(sessions);
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
  }, [activePanel, refreshCount]);

  // The single row-patch path for renames from either surface (sidebar rows
  // via HistoryPanel, main section via SessionTitleBar) — updates the row in
  // place, deliberately without a refetch (see the comment above).
  useEffect(() => onSessionTitleUpdated((detail) => {
    setHistoryItems((prev) =>
      prev.map((s) =>
        s.id === detail.sessionId
          ? { ...s, title: detail.title, updated_at: detail.updatedAt ?? s.updated_at }
          : s
      )
    );
  }), []);

  return { historyItems, setHistoryItems, groups, setGroups, historyLoading, historyError, refresh };
}
