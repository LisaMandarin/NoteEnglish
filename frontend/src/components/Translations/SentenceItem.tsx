import { useEffect, useRef, useState } from "react";
import { Button, Dropdown, Input, Typography } from "antd";
import type { MenuProps } from "antd";
import {
  ApartmentOutlined,
  FormOutlined,
  MoreOutlined,
} from "@ant-design/icons";
import type { Sentence, VocabItem } from "../../types";
import VocabCards from "../Vocab/VocabCards";
import TtsButton from "../shared/TtsButton";
import { useSentenceStructure } from "../../hooks/useSentenceStructure";
import SentenceSkeleton from "../SentenceStructure/SentenceSkeleton";
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
  readOnly = false,
  vocabCollapsed,
  onToggleVocabCollapsed,
}: {
  sentence: Sentence;
  idx: number;
  hideHint?: boolean;
  selectedRange?: SelectedRange | null;
  onDelete?: (sentenceIdx: number, lemma: string, pos: string) => void;
  onReorder?: (sentenceIdx: number, newVocab: VocabItem[]) => void;
  onEdit?: (sentenceIdx: number, vocabItem: VocabItem) => void;
  onNoteChange?: (sentenceIdx: number, note: string) => void;
  readOnly?: boolean;
  vocabCollapsed?: boolean;
  onToggleVocabCollapsed?: () => void;
}): React.ReactElement {
  const note = sentence.note ?? "";
  const hasNote = note.trim().length > 0;
  const [editingNote, setEditingNote] = useState(false);
  const [draftNote, setDraftNote] = useState(note);
  // Uncontrolled fallback so the read-only shared view (which renders outside
  // TranslationsList) still gets per-sentence collapse without a parent state.
  const [localVocabCollapsed, setLocalVocabCollapsed] = useState(false);
  const effectiveVocabCollapsed = vocabCollapsed ?? localVocabCollapsed;
  const toggleVocabCollapsed = onToggleVocabCollapsed ?? ((): void => setLocalVocabCollapsed((c) => !c));
  const structure = useSentenceStructure(sentence.original);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearSaveTimer(): void {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
  }

  // Persist only when the trimmed value actually differs from what's stored.
  function commitNote(value: string): void {
    const next = value.trim();
    if (next !== note.trim()) {
      onNoteChange?.(idx, next);
    }
  }

  // Auto-save safety net: blur is the normal save path, so in typical use this
  // timer never fires (the user clicks away first) and we keep the original
  // one-write-per-edit DB load. It only kicks in during a long uninterrupted
  // edit, so unsaved text survives a reload or accidental navigation.
  const NOTE_SAVE_DELAY_MS = 2000;
  function handleDraftChange(value: string): void {
    setDraftNote(value);
    clearSaveTimer();
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      commitNote(value);
    }, NOTE_SAVE_DELAY_MS);
  }

  function openNoteEditor(): void {
    setDraftNote(note);
    setEditingNote(true);
  }

  function saveNote(): void {
    clearSaveTimer();
    setEditingNote(false);
    commitNote(draftNote);
  }

  useEffect(() => clearSaveTimer, []);

  const moreMenuItems: MenuProps["items"] = [
    // Read-only viewers (shared articles) can analyze but never edit the note.
    ...(readOnly
      ? []
      : [
          {
            key: "note",
            icon: <FormOutlined className={hasNote ? "text-(--accent)" : undefined} />,
            label: hasNote ? "編輯筆記" : "自訂筆記",
            onClick: openNoteEditor,
          },
        ]),
    {
      key: "structure",
      icon: (
        <ApartmentOutlined
          className={structure.visible ? "text-(--accent)" : undefined}
        />
      ),
      label:
        structure.analyzable === false
          ? "句構分析（僅適用完整句子）"
          : "句構分析",
      disabled: structure.analyzable === false,
      onClick: structure.toggle,
    },
  ];

  return (
    <li data-idx={idx} className="flex flex-col gap-1 sm:flex-row sm:gap-4">
      <div className="w-7 h-7 rounded-full bg-(--accent) text-white flex items-center justify-center shrink-0 font-bold text-sm sm:mt-0.5">
        {idx + 1}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-row items-baseline gap-2">
          <div className="flex flex-col items-center gap-1">
            <TtsButton
              text={sentence.original}
              ariaLabel="Pronounce sentence"
              className="flex size-8 items-center justify-center text-gray-500 hover:text-(--accent) transition-colors cursor-pointer"
            />
            <Dropdown
              menu={{ items: moreMenuItems }}
              placement="bottomLeft"
              trigger={["click"]}
            >
              <button
                type="button"
                className={`flex size-8 items-center justify-center transition-colors cursor-pointer hover:text-(--accent) ${
                  hasNote || structure.visible ? "text-(--accent)" : "text-gray-500"
                }`}
                aria-label="更多句子操作"
                aria-haspopup="menu"
              >
                <MoreOutlined />
              </button>
            </Dropdown>
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

            {editingNote && !readOnly ? (
              <div className="mt-2">
                <Input.TextArea
                  value={draftNote}
                  onChange={(e) => handleDraftChange(e.target.value)}
                  onBlur={saveNote}
                  autoFocus
                  autoSize={{ minRows: 2 }}
                  placeholder="輸入筆記…（換行會原樣顯示）"
                />
              </div>
            ) : (
              hasNote && (
                <div
                  onClick={readOnly ? undefined : openNoteEditor}
                  className={`mt-2 rounded-md border border-(--card-border) bg-(--card-bg) px-3 py-2 ${readOnly ? "" : "cursor-text"}`}
                >
                  <Text style={{ whiteSpace: "pre-wrap" }}>{note}</Text>
                </div>
              )
            )}

            {structure.visible && (
              <div className="mt-2">
                {structure.loading && (
                  <Text type="secondary" style={{ fontSize: "0.8rem" }}>
                    分析中…
                  </Text>
                )}
                {structure.error && (
                  <div className="flex items-center gap-2">
                    <Text type="secondary" style={{ fontSize: "0.8rem" }}>
                      {structure.error}
                    </Text>
                    {structure.analyzable !== false && (
                      <Button size="small" onClick={structure.retry}>
                        重試
                      </Button>
                    )}
                  </div>
                )}
                {structure.structure && (
                  <div className="rounded-md border border-(--card-border) bg-(--card-bg) px-3 py-2">
                    <SentenceSkeleton
                      structure={structure.structure}
                      sentenceType={structure.sentenceType}
                      previewWords={3}
                    />
                  </div>
                )}
              </div>
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
          readOnly={readOnly}
          collapsed={effectiveVocabCollapsed}
          onToggleCollapsed={toggleVocabCollapsed}
        />
      </div>
    </li>
  );
}
