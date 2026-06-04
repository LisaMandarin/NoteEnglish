import { useState } from "react";
import { Button, Checkbox } from "antd";
import { PrinterOutlined } from "@ant-design/icons";
import type { Sentence, VocabItem } from "../types";

function collectVocab(sentences: Sentence[]): VocabItem[] {
  const seen = new Set<string>();
  const result: VocabItem[] = [];
  for (const s of sentences) {
    for (const v of s.vocab ?? []) {
      const hasContent = [v.translation, v.definition, v.example, v.level, v.other_1, v.other_2, v.other_3, v.other_4, v.other_5].some(
        (val) => val != null && String(val).trim() !== ""
      );
      if (!hasContent) continue;
      const key = `${v.lemma ?? v.text}|${v.pos ?? ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(v);
      }
    }
  }
  return result;
}

export default function SummaryExportBar({ sentences, sessionTitle }: { sentences: Sentence[]; sessionTitle: string }): React.ReactElement {
  const [includeTranslation, setIncludeTranslation] = useState(true);
  const [includeVocab, setIncludeVocab] = useState(true);

  function openVocabPrintWindow(): void {
    const vocab = collectVocab(sentences);
    if (vocab.length === 0) return;
    localStorage.setItem("latestVocabPrint", JSON.stringify({ sessionTitle, vocab }));
    const url = new URL(window.location.href);
    url.searchParams.set("view", "vocab-print");
    window.open(url.toString(), "_blank");
  }

  function openSummaryWindow() {
    if (!includeTranslation && !includeVocab) return;

    const payload = {
      createdAt: Date.now(),
      sessionTitle,
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
      <div>
        <Button
          icon={<PrinterOutlined />}
          disabled={collectVocab(sentences).length === 0}
          onClick={openVocabPrintWindow}
        >
          列印單字卡
        </Button>
      </div>
    </div>
  );
}
