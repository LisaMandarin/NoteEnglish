import { useEffect, useRef, useState } from "react";
import { useTranslation } from "../../../context/translationContext";
import { listSessions } from "../../../lib/api";

export function useSessionHistory(activePanel) {
  const {
    state: { currentSession },
  } = useTranslation();

  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const prevDepsRef = useRef({ activePanel: undefined, sessionId: undefined });

  useEffect(() => {
    const prev = prevDepsRef.current;
    const panelJustOpened = prev.activePanel !== activePanel;
    const idChanged = prev.sessionId !== (currentSession?.id ?? null);

    prevDepsRef.current = { activePanel, sessionId: currentSession?.id ?? null };

    if (activePanel !== "history") return;
    if (!panelJustOpened && idChanged) return;

    let cancelled = false;

    async function loadHistory() {
      setHistoryLoading(true);
      setHistoryError("");
      try {
        const data = await listSessions();
        if (cancelled) return;
        setHistoryItems(data ?? []);
      } catch (error) {
        if (cancelled) return;
        setHistoryError(error?.message || "Could not load session history.");
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
