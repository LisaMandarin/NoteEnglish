import type { VocabItem } from "../types";

// Cards are keyed by (lemma, pos) — matches the dedup key in translationContext.
export function vocabItemId(v: VocabItem): string {
  return `${v.lemma ?? v.text}-${v.pos ?? "unknown"}`;
}

// DOM anchor for scrolling to a specific card after a lookup.
export function vocabCardDomId(sentenceIdx: number, v: VocabItem): string {
  return `vocab-${sentenceIdx}-${vocabItemId(v)}`;
}
