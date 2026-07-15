import { useState } from "react";
import { Button, Card, Checkbox, Modal } from "antd";
import { EditOutlined, FileTextOutlined, FormOutlined, IdcardOutlined, PrinterOutlined } from "@ant-design/icons";
import type { Sentence, VocabItem } from "../../types";
import { noteHasContent } from "../../lib/noteHtml";

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
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [includeTranslation, setIncludeTranslation] = useState(true);
  const [includeVocab, setIncludeVocab] = useState(true);
  const [includeNote, setIncludeNote] = useState(true);

  const hasVocab = collectVocab(sentences).length > 0;
  const hasNote = sentences.some((s) => noteHasContent(s.note ?? ""));
  const effectiveIncludeVocab = hasVocab && includeVocab;
  const effectiveIncludeNote = hasNote && includeNote;
  const nothingChecked = !includeTranslation && !effectiveIncludeVocab && !effectiveIncludeNote;

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
      includeVocab: effectiveIncludeVocab,
      includeNote: effectiveIncludeNote,
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

  function handleConfirmSummaryPrint(): void {
    openSummaryWindow();
    setPrintModalOpen(false);
  }

  return (
    <div className="mt-8 rounded-2xl border border-(--panel-border) bg-(--panel-bg) p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-2">
        <div>
          <p className="m-0 font-bold text-2xl text-(--accent)">完成本次閱讀了嗎？</p>
          <p className="m-0 text-sm text-black/60">列印學習內容，或透過測驗檢視學習成果。</p>
        </div>
      </div>
      <div className="flex flex-col gap-4 md:flex-row md:items-stretch">
        <Card size="small" className="flex-1">
          <p className="m-0 mb-1 flex items-center gap-2 font-semibold">
            <PrinterOutlined />
            列印與保存
          </p>
          <p className="m-0 mb-3 text-sm text-black/60">
            把筆記和單字卡印出來，或存成 PDF。
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="primary"
              icon={<FileTextOutlined />}
              onClick={() => setPrintModalOpen(true)}
              className="transition-colors"
            >
              預覽筆記
            </Button>
            <Button
              type="primary"
              icon={<IdcardOutlined />}
              disabled={!hasVocab}
              onClick={openVocabPrintWindow}
              className="transition-colors"
            >
              預覽單字卡
            </Button>
          </div>
        </Card>
        {onStartQuiz && (
          <Card size="small" className="flex-1">
            <p className="m-0 mb-1 flex items-center gap-2 font-semibold">
              <EditOutlined />
              線上測驗
            </p>
            <p className="m-0 mb-3 text-sm text-black/60">
              用單字練習、聽寫和閱讀理解，檢視這篇文章的學習成果。
            </p>
            {/* Not gated on vocab: 聽寫/閱讀理解 need no lookups — the quiz
                wizard itself disables the word category when there is none. */}
            <Button
              type="primary"
              icon={<FormOutlined />}
              onClick={onStartQuiz}
              className="transition-colors"
            >
              開始測驗
            </Button>
          </Card>
        )}
      </div>
      {!hasVocab && (
        <p className="mt-2 mb-0 text-sm text-black/60">
          小提醒：先選取文章中的單字查詢，就能列印單字卡和練習單字題型。
        </p>
      )}
      <Modal
        title="預覽筆記"
        open={printModalOpen}
        onCancel={() => setPrintModalOpen(false)}
        onOk={handleConfirmSummaryPrint}
        okText="預覽輸出畫面"
        cancelText="取消"
        okButtonProps={{ disabled: nothingChecked }}
      >
        <p className="mb-2 text-black/60">選擇要包含的內容：</p>
        <div className="flex flex-col gap-2">
          <Checkbox
            checked={includeTranslation}
            onChange={(e) => setIncludeTranslation(e.target.checked)}
          >
            中文翻譯
          </Checkbox>
          <Checkbox
            checked={effectiveIncludeVocab}
            disabled={!hasVocab}
            onChange={(e) => setIncludeVocab(e.target.checked)}
          >
            單字筆記
            {!hasVocab && (
              <span className="ml-1 text-black/60">（尚未查詢任何單字）</span>
            )}
          </Checkbox>
          <Checkbox
            checked={effectiveIncludeNote}
            disabled={!hasNote}
            onChange={(e) => setIncludeNote(e.target.checked)}
          >
            自訂筆記
            {!hasNote && (
              <span className="ml-1 text-black/60">（尚未寫任何自訂筆記）</span>
            )}
          </Checkbox>
        </div>
        {nothingChecked && (
          <p className="mt-2 mb-0 text-sm text-black/60">請至少勾選一項內容。</p>
        )}

        <p className="mt-4 mb-2 text-xs font-medium text-black/60">列印範例</p>
        <div className="rounded-lg border border-black/10 bg-white p-3 text-sm shadow-sm">
          <div className="flex gap-2">
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-(--card-border) text-[11px] font-semibold text-white">
              1
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div>
                <span className="font-semibold">原文:</span> The cat sat on the mat.
              </div>
              {includeTranslation && <div className="text-black/70">貓咪坐在墊子上。</div>}
              {effectiveIncludeNote && (
                <div>
                  <div className="text-xs font-semibold">自訂筆記:</div>
                  <div className="text-black/70">sit 的過去式是 sat，容易搞混。</div>
                </div>
              )}
              {effectiveIncludeVocab && (
                <div>
                  <div className="mb-1.5 text-xs font-semibold">單字筆記:</div>
                  {/* Mirrors the printed VocabCard layout: word + pos badge,
                      translation, definition, gray example block, CEFR level. */}
                  <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
                    {[
                      {
                        text: "sat",
                        pos: "v.",
                        translation: "坐",
                        definition: "past tense of sit",
                        example: "The cat sat on the mat.",
                        level: "A1",
                      },
                      {
                        text: "mat",
                        pos: "n.",
                        translation: "墊子",
                        definition: "a small piece of thick material on the floor",
                        example: "Wipe your shoes on the mat.",
                        level: "A2",
                      },
                    ].map((v) => (
                      <div
                        key={v.text}
                        className="rounded-xl border border-black/15 bg-white p-2.5"
                      >
                        <div className="mb-0.5 flex items-center gap-1.5">
                          <span className="text-sm font-bold">{v.text}</span>
                          <span className="rounded bg-black/8 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-black/60">
                            {v.pos}
                          </span>
                        </div>
                        <div className="mb-1 text-base font-bold">{v.translation}</div>
                        <p className="m-0 mb-1 text-xs leading-relaxed text-black/70">
                          {v.definition}
                        </p>
                        <div className="rounded-md bg-black/6 px-2 py-1 text-xs text-black/70">
                          {v.example}
                        </div>
                        <div className="mt-1.5 text-[10px] font-semibold text-black/60">
                          {v.level}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          {nothingChecked && (
            <p className="mt-2 mb-0 text-xs text-black/60">勾選上方項目即可預覽列印內容。</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
