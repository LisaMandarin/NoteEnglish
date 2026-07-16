// Window event carrying a successful session rename to the sidebar history
// list, which deliberately holds its own state outside TranslationContext
// (see useSessionHistory.ts) — both rename surfaces (sidebar rows and the
// main-section title bar) dispatch through here, and the single listener in
// useSessionHistory patches the matching row in place.

export const SESSION_TITLE_UPDATED_EVENT = "ne:session-title-updated";

export type SessionTitleUpdatedDetail = {
  sessionId: string;
  title: string;
  updatedAt?: string;
};

export function dispatchSessionTitleUpdated(detail: SessionTitleUpdatedDetail): void {
  window.dispatchEvent(new CustomEvent(SESSION_TITLE_UPDATED_EVENT, { detail }));
}

// Returns the unsubscribe function, so `useEffect(() => onSessionTitleUpdated(...), [])`
// cleans up on its own.
export function onSessionTitleUpdated(handler: (detail: SessionTitleUpdatedDetail) => void): () => void {
  function listener(e: Event): void {
    const detail = (e as CustomEvent<SessionTitleUpdatedDetail>).detail;
    if (detail) handler(detail);
  }
  window.addEventListener(SESSION_TITLE_UPDATED_EVENT, listener);
  return () => window.removeEventListener(SESSION_TITLE_UPDATED_EVENT, listener);
}
