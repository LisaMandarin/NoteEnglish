import { useEffect, useState } from "react";
import { loadWordMastery } from "../lib/mastery";
import type { WordMasteryItem } from "../types";

// Mastery map keyed by masteryKey(lemma, pos); null while loading or when the
// fetch fails (callers simply render no badge).
export function useWordMastery(): Map<string, WordMasteryItem> | null {
  const [map, setMap] = useState<Map<string, WordMasteryItem> | null>(null);

  useEffect(() => {
    let mounted = true;
    loadWordMastery()
      .then((loaded) => {
        if (mounted) setMap(loaded);
      })
      .catch(() => {
        // Badges are decoration; a failed fetch just hides them.
      });
    return () => {
      mounted = false;
    };
  }, []);

  return map;
}
