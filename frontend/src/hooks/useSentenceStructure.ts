import { useState } from "react";
import { parseSentence } from "../lib/api";
import type { SyntaxToken } from "../types";

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
  const [tokens, setTokens] = useState<SyntaxToken[] | null>(null);
  const [reliable, setReliable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [visible, setVisible] = useState(false);

  function toggle(): void {
    if (visible) {
      setVisible(false);
      return;
    }
    setVisible(true);
    if (tokens || loading) return; // already fetched or fetching — just reveal.

    setLoading(true);
    setError(false);
    parseSentence(sentence)
      .then((result) => {
        setTokens(result.tokens);
        setReliable(result.reliable);
      })
      .catch((e: unknown) => {
        console.error(e);
        setError(true);
      })
      .finally(() => setLoading(false));
  }

  return { tokens, reliable, loading, error, visible, toggle };
}
