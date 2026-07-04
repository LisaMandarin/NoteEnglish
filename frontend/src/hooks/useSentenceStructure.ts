import { useState } from "react";
import { parseSentence } from "../lib/api";
import type { SentenceType, StructureNode } from "../types";

type SentenceStructureState = {
  sentence: string;
  requestId: number;
  structure: StructureNode | null;
  sentenceType: SentenceType | null;
  loaded: boolean;
  loading: boolean;
  error: string | null;
  visible: boolean;
};

function initialState(sentence: string, requestId = 0): SentenceStructureState {
  return {
    sentence,
    requestId,
    structure: null,
    sentenceType: null,
    loaded: false,
    loading: false,
    error: null,
    visible: false,
  };
}

// Lazily fetches a sentence's structure analysis the first time it is revealed
// and caches it, so toggling the structure view off/on does not re-hit the API.
export function useSentenceStructure(sentence: string): {
  structure: StructureNode | null;
  sentenceType: SentenceType | null;
  loading: boolean;
  error: string | null;
  visible: boolean;
  // null = not parsed yet (unknown); false = the API rejected an incomplete
  // sentence or returned no structure, so the toggle should be disabled.
  analyzable: boolean | null;
  toggle: () => void;
  retry: () => void;
} {
  const [state, setState] = useState<SentenceStructureState>(() =>
    initialState(sentence)
  );

  // SentenceItem instances are keyed by list index and can be reused across
  // sessions. Reset synchronously so a reused item cannot render a stale parse.
  // Incrementing requestId also invalidates any parse still in flight.
  if (sentence !== state.sentence) {
    setState(initialState(sentence, state.requestId + 1));
  }

  // Fetch the analysis, opening the panel. Shared by the first reveal and retry;
  // a fresh requestId invalidates any earlier in-flight parse.
  function fetchStructure(): void {
    const requestId = state.requestId + 1;
    setState((current) =>
      current.sentence === sentence
        ? { ...current, requestId, visible: true, loading: true, error: null }
        : current
    );

    parseSentence(sentence)
      .then((result) => {
        // No structure → nothing to render; close the panel so an empty box never
        // shows, and the button disables itself.
        setState((current) =>
          current.sentence === sentence && current.requestId === requestId
            ? {
                ...current,
                structure: result.structure,
                sentenceType: result.sentence_type,
                loaded: true,
                visible: result.structure ? current.visible : false,
              }
            : current
        );
      })
      .catch((e: unknown) => {
        console.error(e);
        const incompleteMessage = "分析句構只適用於完整的句子";
        const message =
          e instanceof Error && e.message.includes(incompleteMessage)
            ? incompleteMessage
            : "句構分析失敗";
        setState((current) =>
          current.sentence === sentence && current.requestId === requestId
            ? {
                ...current,
                error: message,
                loaded: message === incompleteMessage,
              }
            : current
        );
      })
      .finally(() => {
        setState((current) =>
          current.sentence === sentence && current.requestId === requestId
            ? { ...current, loading: false }
            : current
        );
      });
  }

  function toggle(): void {
    if (state.visible) {
      setState((current) =>
        current.sentence === sentence ? { ...current, visible: false } : current
      );
      return;
    }

    if (state.loaded || state.loading) {
      setState((current) =>
        current.sentence === sentence ? { ...current, visible: true } : current
      );
      return;
    }

    fetchStructure();
  }

  return {
    structure: state.structure,
    sentenceType: state.sentenceType,
    loading: state.loading,
    error: state.error,
    visible: state.visible,
    analyzable: state.loaded ? state.structure !== null : null,
    toggle,
    retry: fetchStructure,
  };
}
