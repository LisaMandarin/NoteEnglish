import { useState } from "react";
import { Button, Card, Checkbox } from "antd";
import { FormOutlined, PrinterOutlined } from "@ant-design/icons";
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

export default function StudyActions({
  sentences,
  sessionTitle,
  onStartQuiz,
}: {
  sentences: Sentence[];
  sessionTitle: string;
  // Absent in the read-only shared view — the quiz works on one's own sessions.
  onStartQuiz?: () => void;
}): React.ReactElement {
  const [includeTranslation, setIncludeTranslation] = useState(true);
  const [includeVocab, setIncludeVocab] = useState(true);
  const [includeNote, setIncludeNote] = useState(true);

  const hasVocab = collectVocab(sentences).length > 0;
  const nothingChecked = !includeTranslation && !includeVocab && !includeNote;

  function openVocabPrintWindow(): void {
    const vocab = collectVocab(sentences);
    if (vocab.length === 0) return;
    localStorage.setItem("latestVocabPrint", JSON.stringify({ sessionTitle, vocab }));
    const url = new URL(window.location.href);
    url.searchParams.set("view", "vocab-print");
    window.open(url.toString(), "_blank");
  }

  function openSummaryWindow(): void {
    if (nothingChecked) return;

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
    <div className="mt-8">
      <p className="mb-3 font-semibold text-(--text-main)">
        📌 完成翻譯和查單字了嗎？接下來你可以：
      </p>
      <div className="flex flex-col gap-4 md:flex-row md:items-stretch">
        <Card size="small" className="flex-1 border-(--card-border) bg-(--card-bg)">
          <p className="m-0 mb-1 font-semibold">🖨️ 列印保存</p>
          <p className="m-0 mb-3 text-sm text-black/60">
            把筆記和單字卡印出來，或存成 PDF。
          </p>
          <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm text-black/60">彙整資料包含：</span>
            <Checkbox
              checked={includeTranslation}
              onChange={(e) => setIncludeTranslation(e.target.checked)}
            >
              中文翻譯
            </Checkbox>
            <Checkbox
              checked={includeVocab}
              onChange={(e) => setIncludeVocab(e.target.checked)}
            >
              單字筆記
            </Checkbox>
            <Checkbox
              checked={includeNote}
              onChange={(e) => setIncludeNote(e.target.checked)}
            >
              我的筆記
            </Checkbox>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              icon={<PrinterOutlined />}
              disabled={nothingChecked}
              onClick={openSummaryWindow}
              className="transition-colors"
            >
              列印彙整資料
            </Button>
            <Button
              icon={<PrinterOutlined />}
              disabled={!hasVocab}
              onClick={openVocabPrintWindow}
              className="transition-colors"
            >
              列印單字卡
            </Button>
          </div>
        </Card>
        {onStartQuiz && (
          <Card size="small" className="flex-1 border-(--card-border) bg-(--card-bg)">
            <p className="m-0 mb-1 font-semibold">✏️ 線上測驗</p>
            <p className="m-0 mb-3 text-sm text-black/60">
              用剛查過的單字測試自己，看看記住了多少。
            </p>
            <Button
              type="primary"
              icon={<FormOutlined />}
              disabled={!hasVocab}
              onClick={onStartQuiz}
              className="transition-colors"
            >
              單字測驗
            </Button>
          </Card>
        )}
      </div>
      {!hasVocab && (
        <p className="mt-2 mb-0 text-sm text-black/45">
          小提醒：先選取文章中的單字查詢，就能列印單字卡和做測驗。
        </p>
      )}
    </div>
  );
}
