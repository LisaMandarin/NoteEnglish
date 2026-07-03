import { useState } from "react";
import { parseSentence } from "../lib/api";
import type { SyntaxToken } from "../types";

type SentenceStructureState = {
  sentence: string;
  requestId: number;
  tokens: SyntaxToken[] | null;
  reliable: boolean;
  loading: boolean;
  error: boolean;
  visible: boolean;
};

function initialState(sentence: string, requestId = 0): SentenceStructureState {
  return {
    sentence,
    requestId,
    tokens: null,
    reliable: true,
    loading: false,
    error: false,
    visible: false,
  };
}

// Lazily fetches a sentence's dependency parse the first time it is revealed and
// caches it, so toggling the structure view off/on does not re-hit the API.
export function useSentenceStructure(sentence: string): {
  tokens: SyntaxToken[] | null;
  reliable: boolean;
  loading: boolean;
  error: boolean;
  visible: boolean;
  toggle: () => void;
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

  function toggle(): void {
    if (state.visible) {
      setState((current) =>
        current.sentence === sentence ? { ...current, visible: false } : current
      );
      return;
    }

    if (state.tokens || state.loading) {
      setState((current) =>
        current.sentence === sentence ? { ...current, visible: true } : current
      );
      return;
    }

    const requestId = state.requestId + 1;
    setState((current) =>
      current.sentence === sentence
        ? { ...current, requestId, visible: true, loading: true, error: false }
        : current
    );

    parseSentence(sentence)
      .then((result) => {
        setState((current) =>
          current.sentence === sentence && current.requestId === requestId
            ? {
                ...current,
                tokens: result.tokens,
                reliable: result.reliable,
              }
            : current
        );
      })
      .catch((e: unknown) => {
        console.error(e);
        setState((current) =>
          current.sentence === sentence && current.requestId === requestId
            ? { ...current, error: true }
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

  return {
    tokens: state.tokens,
    reliable: state.reliable,
    loading: state.loading,
    error: state.error,
    visible: state.visible,
    toggle,
  };
}
