import { useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";

export function useVocabLookup(sentences) {
  const [selectedText, setSelectedText] = useState("");
  const [selectedSentenceIdx, setSelectedSentenceIdx] = useState(null);
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);

  function reset() {
    setSelectedText("");
    setSelectedSentenceIdx(null);
    setOptions([]);
    setLoading(false);
  }

  async function lookup() {
    if (!selectedText) return;

    if (options.length === 0) {
      alert("請至少選一個查詢選項");
      return false;
    }

    setLoading(true);

    try {
      const sentence = sentences[selectedSentenceIdx];
      const vocabList = sentence?.vocab ?? [];

      const hit = vocabList.find(
        (v) => v.lemma?.toLowerCase() === selectedText.toLowerCase()
      );

      const opt = new Set(options);

      const payload = {
        lemma: selectedText,
        pos: hit?.pos ?? "unknown",
        options: {
          translation: opt.has("zh"),
          definition: opt.has("en"),
          example: opt.has("ex"),
          level: opt.has("level"),
        },
      };

      const res = await fetch(`${API_BASE}/api/vocab/detail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

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
