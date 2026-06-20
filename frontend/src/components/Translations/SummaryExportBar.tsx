import { useState } from "react";
import { Button, Checkbox } from "antd";
import { PrinterOutlined } from "@ant-design/icons";
import type { Sentence, VocabItem } from "../../types";

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
  const [includeNote, setIncludeNote] = useState(true);

  function openVocabPrintWindow(): void {
    const vocab = collectVocab(sentences);
    if (vocab.length === 0) return;
    localStorage.setItem("latestVocabPrint", JSON.stringify({ sessionTitle, vocab }));
    const url = new URL(window.location.href);
    url.searchParams.set("view", "vocab-print");
    window.open(url.toString(), "_blank");
  }

  function openSummaryWindow() {
    if (!includeTranslation && !includeVocab && !includeNote) return;

    const payload = {
      createdAt: Date.now(),
      sessionTitle,
      includeTranslation,
      includeVocab,
      includeNote,
      rows: sentences.map((s, idx) => ({
        idx,
        original: s.original ?? "",
        translation: s.translation ?? "",
        note: s.note ?? "",
        vocab: s.vocab ?? [],
      })),
    };

    localStorage.setItem("latestSummary", JSON.stringify(payload));
    const url = new URL(window.location.href);
    url.searchParams.set("view", "summary");
    window.open(url.toString(), "_blank");
  }

  return (
    <div className="flex flex-wrap gap-3 mt-4">
      <div className="flex items-center">
        <Checkbox
          checked={includeTranslation}
          onChange={(e) => setIncludeTranslation(e.target.checked)}
        >
          中文翻譯
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
      <div className="flex items-center">
        <Checkbox
          checked={includeNote}
          onChange={(e) => setIncludeNote(e.target.checked)}
        >
          我的筆記
        </Checkbox>
      </div>
      <div>
        <Button
          icon={<PrinterOutlined />}
          disabled={!includeTranslation && !includeVocab && !includeNote}
          onClick={openSummaryWindow}
          className="transition-colors"
        >
          列印彙整資料
        </Button>
      </div>
      <div>
        <Button
          icon={<PrinterOutlined />}
          disabled={collectVocab(sentences).length === 0}
          onClick={openVocabPrintWindow}
          className="transition-colors duration-500"
        >
          列印單字卡
        </Button>
      </div>
    </div>
  );
}
