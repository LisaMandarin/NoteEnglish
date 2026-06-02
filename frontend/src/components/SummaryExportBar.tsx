import { useState } from "react";
import { Button, Checkbox } from "antd";

export default function SummaryExportBar({ sentences }) {
  const [includeTranslation, setIncludeTranslation] = useState(true);
  const [includeVocab, setIncludeVocab] = useState(true);

  function openSummaryWindow() {
    if (!includeTranslation && !includeVocab) return;

    const payload = {
      createdAt: Date.now(),
      includeTranslation,
      includeVocab,
      rows: sentences.map((s, idx) => ({
        idx,
        original: s.original ?? "",
        translation: s.translation ?? "",
        vocab: s.vocab ?? [],
      })),
    };

    localStorage.setItem("latestSummary", JSON.stringify(payload));
    const url = new URL(window.location.href);
    url.searchParams.set("view", "summary");
    window.open(url.toString(), "_blank");
  }

  return (
    <div className="flex gap-3 mt-4">
      <div className="flex items-center">
        <Checkbox
          checked={includeTranslation}
          onChange={(e) => setIncludeTranslation(e.target.checked)}
        >
          翻譯
        </Checkbox>
      </div>
      <div className="flex items-center">
        <Checkbox
          checked={includeVocab}
          onChange={(e) => setIncludeVocab(e.target.checked)}
        >
          單字筆記
        </Checkbox>
      </div>
      <div>
        <Button
          type="primary"
          disabled={!includeTranslation && !includeVocab}
          onClick={openSummaryWindow}
        >
          彙整
        </Button>
      </div>
    </div>
  );
}
