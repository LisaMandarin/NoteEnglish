import { useState } from "react";
import { Input, Typography } from "antd";
import { FormOutlined, SoundOutlined } from "@ant-design/icons";
import type { Sentence, VocabItem } from "../../types";
import VocabCards from "../Vocab/VocabCards";
import { speak } from "../../lib/speech";
const { Text } = Typography;

type SelectedRange = {
  start: number;
  end: number;
};

function renderOriginalText(text: string, selectedRange?: SelectedRange | null): React.ReactNode {
  if (
    !selectedRange ||
    selectedRange.start < 0 ||
    selectedRange.end > text.length ||
    selectedRange.start >= selectedRange.end
  ) {
    return text;
  }

  return (
    <>
      {text.slice(0, selectedRange.start)}
      <span className="lookup-selected-word">
        {text.slice(selectedRange.start, selectedRange.end)}
      </span>
      {text.slice(selectedRange.end)}
    </>
  );
}

export default function SentenceItem({
  sentence,
  idx,
  hideHint,
  selectedRange,
  onDelete,
  onReorder,
  onEdit,
  onNoteChange,
}: {
  sentence: Sentence;
  idx: number;
  hideHint?: boolean;
  selectedRange?: SelectedRange | null;
  onDelete?: (sentenceIdx: number, lemma: string, pos: string) => void;
  onReorder?: (sentenceIdx: number, newVocab: VocabItem[]) => void;
  onEdit?: (sentenceIdx: number, vocabItem: VocabItem) => void;
  onNoteChange?: (sentenceIdx: number, note: string) => void;
}): React.ReactElement {
  const note = sentence.note ?? "";
  const hasNote = note.trim().length > 0;
  const [editingNote, setEditingNote] = useState(false);
  const [draftNote, setDraftNote] = useState(note);

  function openNoteEditor(): void {
    setDraftNote(note);
    setEditingNote(true);
  }

  function saveNote(): void {
    setEditingNote(false);
    const next = draftNote.trim();
    if (next !== note.trim()) {
      onNoteChange?.(idx, next);
    }
  }

  return (
    <li data-idx={idx} className="flex flex-col gap-1 sm:flex-row sm:gap-4">
      <div className="w-7 h-7 rounded-full bg-(--accent) text-white flex items-center justify-center shrink-0 font-bold text-sm sm:mt-0.5">
        {idx + 1}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-row items-baseline gap-2">
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => speak(sentence.original)}
              className="text-gray-400 hover:text-(--accent) transition-colors cursor-pointer"
              aria-label="Pronounce sentence"
            >
              <SoundOutlined />
            </button>
            <button
              type="button"
              onClick={openNoteEditor}
              className={`transition-colors cursor-pointer hover:text-(--accent) ${
                hasNote ? "text-(--accent)" : "text-gray-400"
              }`}
              aria-label="Add note"
              title="自訂筆記"
            >
              <FormOutlined />
            </button>
          </div>
          <div className="min-w-0 flex-1">
            <span className="lookup-original-text" data-original-text="true">
              <Text strong style={{ fontSize: "1.25rem", whiteSpace: "pre-wrap" }}>
                {renderOriginalText(sentence.original, selectedRange)}
              </Text>
            </span>
            <div className="select-none">
              <Text type="secondary" style={{ whiteSpace: "pre-wrap" }}>
                {sentence.translation}
              </Text>
            </div>

            {editingNote ? (
              <div className="mt-2">
                <Input.TextArea
                  value={draftNote}
                  onChange={(e) => setDraftNote(e.target.value)}
                  onBlur={saveNote}
                  autoFocus
                  autoSize={{ minRows: 2 }}
                  placeholder="輸入筆記…（換行會原樣顯示）"
                />
              </div>
            ) : (
              hasNote && (
                <div
                  onClick={openNoteEditor}
                  className="mt-2 cursor-text rounded-md border border-(--card-border) bg-(--card-bg) px-3 py-2"
                >
                  <Text style={{ whiteSpace: "pre-wrap" }}>{note}</Text>
                </div>
              )
            )}
          </div>
        </div>

        <VocabCards
          vocab={sentence.vocab}
          sentenceIdx={idx}
          hideHint={hideHint}
          onDelete={onDelete}
          onReorder={onReorder}
          onEdit={onEdit}
        />
      </div>
    </li>
  );
}
