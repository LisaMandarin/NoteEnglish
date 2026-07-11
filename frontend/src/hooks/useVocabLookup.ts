import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { apiFetch } from "../lib/api";
import type { Sentence, VocabItem } from "../types";

// Remembered lookup checkboxes; 中文意思 ("zh") is mandatory and always forced in.
const LOOKUP_OPTIONS_KEY = "ne_lookup_options";

function withRequired(options: string[]): string[] {
  return options.includes("zh") ? options : ["zh", ...options];
}

function loadStoredOptions(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LOOKUP_OPTIONS_KEY) ?? "");
    if (Array.isArray(parsed)) {
      return withRequired(parsed.filter((v): v is string => typeof v === "string"));
    }
  } catch {
    // fall through to the default below
  }
  return ["zh"];
}

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
  const [options, setOptionsState] = useState<string[]>(loadStoredOptions);
  const [loading, setLoading] = useState(false);

  // Force the mandatory "zh" option and remember the combination for next time.
  const setOptions: Dispatch<SetStateAction<string[]>> = (action) => {
    setOptionsState((prev) => {
      const next = withRequired(typeof action === "function" ? action(prev) : action);
      try {
        localStorage.setItem(LOOKUP_OPTIONS_KEY, JSON.stringify(next));
      } catch {
        // Persisting is best-effort; the in-memory selection still applies.
      }
      return next;
    });
  };

  // Keeps the remembered options — only the selection itself is cleared.
  function reset(): void {
    setSelectedText("");
    setSelectedSentenceIdx(null);
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
      const msg = e instanceof Error ? e.message : "";
      if (msg === "Not authenticated." || msg.includes("401")) {
        alert("登入狀態已失效，請重新整理頁面後再試。");
      } else if (msg.includes("429")) {
        alert("查詢次數過多，請稍等幾秒後再試。");
      } else if (msg.includes("503")) {
        alert("AI 服務暫時忙碌，請稍後再試。");
      } else if (e instanceof TypeError) {
        alert("網路連線異常，請確認網路後再試。");
      } else if (/HTTP 5\d\d/.test(msg)) {
        alert("伺服器暫時無法使用，請稍後再試。");
      } else {
        alert("查詢失敗，請稍後再試。");
      }
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
