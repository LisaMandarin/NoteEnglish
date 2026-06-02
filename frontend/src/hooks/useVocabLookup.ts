import { useState } from "react";
import { apiFetch } from "../lib/api";


/**
 * @param {Array} sentences 
 * @param {Function} updateSentenceVocab - from translationContext actions
 */
export function useVocabLookup(sentences, updateSentenceVocab, sessionId: string | null = null) {
  const [selectedText, setSelectedText] = useState("");
  const [selectedSentenceIdx, setSelectedSentenceIdx] = useState(null);
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);

  function reset() {
    setSelectedText("");
    setSelectedSentenceIdx(null);
    setOptions([]);
  }

  async function lookup() {
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
      const vocabList = sentence?.vocab ?? [];

      const normalized = text.toLowerCase();

      // Prefer an exact text match, otherwise fall back to lemma match.
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
      });

      const vocabItem = {
        lemma: hit?.lemma,
        pos: hit?.pos,
        ...detail,
      }

      if (typeof updateSentenceVocab === "function") {
        updateSentenceVocab(sentenceIdx, vocabItem);
      } else {
        console.warn("updateSentenceVocab is missing; cannot write back vocab.");
      }

      reset();
      return true;
    } catch (e) {
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
