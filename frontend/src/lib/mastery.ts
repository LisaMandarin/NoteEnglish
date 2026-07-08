import { getWordMastery } from "./api";
import type { WordMasteryItem } from "../types";

// Module-level cache: every vocab card shares one fetch per session, and a
// finished quiz invalidates it so badges refresh on the next mount.
let cache: Map<string, WordMasteryItem> | null = null;
let inflight: Promise<Map<string, WordMasteryItem>> | null = null;

export function masteryKey(lemma?: string, pos?: string): string {
  return `${(lemma ?? "").trim().toLowerCase()}|${(pos ?? "").trim().toLowerCase()}`;
}

export async function loadWordMastery(): Promise<Map<string, WordMasteryItem>> {
  if (cache) return cache;
  if (!inflight) {
    inflight = getWordMastery()
      .then((items) => {
        cache = new Map(items.map((item) => [masteryKey(item.lemma, item.pos), item]));
        return cache;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function invalidateWordMastery(): void {
  cache = null;
}
