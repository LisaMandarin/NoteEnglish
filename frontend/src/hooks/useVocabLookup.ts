import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { apiFetch } from "../lib/api";
import type { Sentence, VocabItem } from "../types";

export function useVocabLookup(
  sentences: Sentence[],
  updateSentenceVocab: (sentenceIdx: number, vocabItem: VocabItem) => void,
  sessionId: string | null = null
): {
  selectedText: string;
  selectedSentenceIdx: number | null;
  options: string[];
  loading: boolean;
  setSelectedText: Dispatch<SetStateAction<string>>;
  setSelectedSentenceIdx: Dispatch<SetStateAction<number | null>>;
  setOptions: Dispatch<SetStateAction<string[]>>;
  lookup: () => Promise<boolean>;
  reset: () => void;
} {
  const [selectedText, setSelectedText] = useState<string>("");
  const [selectedSentenceIdx, setSelectedSentenceIdx] = useState<number | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  function reset(): void {
    setSelectedText("");
    setSelectedSentenceIdx(null);
    setOptions([]);
  }

  async function lookup(): Promise<boolean> {
    const text = selectedText.trim();
    if (!text) return false;

    if (options.length === 0) {
      alert("請至少選一個查詢選項");
      return false;
    }

    const sentenceIdx = selectedSentenceIdx;
    if (sentenceIdx === null) return false;

    setLoading(true);

    try {
      const sentence = sentences?.[sentenceIdx];
      const vocabList: VocabItem[] = sentence?.vocab ?? [];

      const normalized = text.toLowerCase();

      const hit = vocabList.find((v) => {
        const textMatch = v.text?.toLowerCase() === normalized;
        const lemmaMatch = v.lemma?.toLowerCase() === normalized;
        return textMatch || lemmaMatch;
      });

      const opt = new Set(options);

      const sentenceText = sentence?.original ?? "";
      const wordIndex = sentenceText.toLowerCase().indexOf(normalized);

      const payload = {
        selected_text: text,
        sentence: sentenceText,
        session_id: sessionId,
        sentence_id: sentenceIdx,
        word_index: wordIndex,
        options: {
          translation: opt.has("zh"),
          definition: opt.has("en"),
          example: opt.has("ex"),
          level: opt.has("level"),
        },
      };

      const detail = await apiFetch("/api/vocab/lookup", {
        method: "POST",
        body: JSON.stringify(payload),
      }) as Partial<VocabItem>;

      const vocabItem: VocabItem = {
        text: hit?.text ?? text,
        lemma: hit?.lemma ?? text,
        pos: hit?.pos ?? "",
        ...detail,
      };

      updateSentenceVocab(sentenceIdx, vocabItem);

      reset();
      return true;
    } catch (e: unknown) {
      console.error(e);
      alert("查詢失敗，請再試一次");
      return false;
    } finally {
      setLoading(false);
    }
  }

  return {
    selectedText,
    selectedSentenceIdx,
    options,
    loading,
    setSelectedText,
    setSelectedSentenceIdx,
    setOptions,
    lookup,
    reset,
  };
}
