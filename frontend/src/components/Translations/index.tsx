import { useEffect, useRef, useState } from "react";
import { Button, Typography } from "antd";
import { ArrowUpOutlined } from "@ant-design/icons";
import { useTranslation } from "../../context/translationContext";
import SelectionMenu from "./SelectionMenu";
import { useVocabLookup } from "../../hooks/useVocabLookup";
import { useSelectionMenu } from "../../hooks/useSelectionMenu";
import SentenceItem from "./SentenceItem";
import StudyActions from "./StudyActions";
import { vocabCardDomId } from "../../lib/vocabCard";
const { Text } = Typography;

const VOCAB_FLASH_MS = 1600;
// How long the 回到原句 button stays up after a lookup jumps to the new card.
const RETURN_TO_SENTENCE_MS = 6000;

export default function TranslationsList({ onStartQuiz }: { onStartQuiz: () => void }): React.ReactElement {
  const {
    state: { sentences, saving, currentSession },
    actions: { updateSentenceVocab, removeSentenceVocab, reorderSentenceVocab, updateSentenceNote },
  } = useTranslation();

  const containerRef = useRef<HTMLDivElement>(null);
  const vocab = useVocabLookup(sentences, updateSentenceVocab, currentSession?.id ?? null);

  // Per-sentence vocab collapse; UI-only, resets when the session changes.
  const [collapsedVocab, setCollapsedVocab] = useState<Set<number>>(new Set());
  const pendingScrollRef = useRef<string | null>(null);
  // Sentence the 回到原句 button jumps back to; null hides the button.
  const [returnIdx, setReturnIdx] = useState<number | null>(null);
  const returnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionId = currentSession?.id ?? null;
  const [prevSessionId, setPrevSessionId] = useState<string | null>(sessionId);
  if (prevSessionId !== sessionId) {
    setPrevSessionId(sessionId);
    setCollapsedVocab(new Set());
    setReturnIdx(null);
  }

  useEffect(() => {
    return () => {
      if (returnTimerRef.current) clearTimeout(returnTimerRef.current);
    };
  }, []);

  // Runs after every commit; only acts when a lookup queued a card to reveal,
  // at which point the new card is guaranteed to be in the DOM.
  useEffect(() => {
    const id = pendingScrollRef.current;
    if (!id) return;
    pendingScrollRef.current = null;
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("vocab-flash");
    setTimeout(() => el.classList.remove("vocab-flash"), VOCAB_FLASH_MS);
  });

  function toggleSentenceVocab(idx: number): void {
    setCollapsedVocab((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }
  const {
    menuOpen,
    menuPos,
    selectedHighlight,
    handleMouseUp,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    closeMenu,
    clearSelection,
  } =
    useSelectionMenu({ containerRef, vocab });

  async function onLookUp(): Promise<void> {
    const result = await vocab.lookup();
    if (result) {
      closeMenu();
      clearSelection();
      // Make sure the card's sentence is expanded before scrolling to it.
      setCollapsedVocab((prev) => {
        if (!prev.has(result.sentenceIdx)) return prev;
        const next = new Set(prev);
        next.delete(result.sentenceIdx);
        return next;
      });
      pendingScrollRef.current = vocabCardDomId(result.sentenceIdx, result.vocabItem);
      setReturnIdx(result.sentenceIdx);
      if (returnTimerRef.current) clearTimeout(returnTimerRef.current);
      returnTimerRef.current = setTimeout(() => {
        returnTimerRef.current = null;
        setReturnIdx(null);
      }, RETURN_TO_SENTENCE_MS);
    }
  }

  function returnToSentence(): void {
    if (returnIdx === null) return;
    if (returnTimerRef.current) {
      clearTimeout(returnTimerRef.current);
      returnTimerRef.current = null;
    }
    // Target the sentence text, not the whole <li> — centering the li would
    // land in the middle of its vocab cards.
    containerRef.current
      ?.querySelector(`li[data-idx="${returnIdx}"] .lookup-original-text`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    setReturnIdx(null);
  }

  if (!sentences.length) {
    return <Text type="secondary">No translations yet.</Text>;
  }

  const hasAnyVocab = sentences.some((s) => Array.isArray(s.vocab) && s.vocab.length > 0);

  const vocabSentenceIdxs = sentences
    .map((s, i) => (Array.isArray(s.vocab) && s.vocab.length > 0 ? i : -1))
    .filter((i) => i >= 0);
  const allCollapsed =
    vocabSentenceIdxs.length > 0 && vocabSentenceIdxs.every((i) => collapsedVocab.has(i));

  function toggleAllVocab(): void {
    setCollapsedVocab(allCollapsed ? new Set() : new Set(vocabSentenceIdxs));
  }

  return (
    <div
      ref={containerRef}
      onMouseUp={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onContextMenu={(e) => e.preventDefault()}
      className="relative"
    >
      {saving && (
        <div
          className="pointer-events-none absolute right-3 top-2 z-10 rounded-md bg-(--card-bg) px-2 py-1 shadow-sm"
          role="status"
          aria-live="polite"
        >
          <span className="text-xs text-gray-400 animate-pulse">儲存中...</span>
        </div>
      )}
      {hasAnyVocab && (
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={toggleAllVocab}
            className="text-sm text-gray-400 hover:text-(--accent) transition-colors cursor-pointer"
          >
            {allCollapsed ? "展開所有單字卡" : "折疊所有單字卡"}
          </button>
        </div>
      )}
      <ol className="list-decimal space-y-8">
        {sentences.map((s, idx) => (
          <SentenceItem
            key={idx}
            sentence={s}
            idx={idx}
            hideHint={hasAnyVocab}
            selectedRange={
              selectedHighlight?.sentenceIdx === idx
                ? { start: selectedHighlight.start, end: selectedHighlight.end }
                : null
            }
            onDelete={removeSentenceVocab}
            onReorder={reorderSentenceVocab}
            onEdit={updateSentenceVocab}
            onNoteChange={updateSentenceNote}
            vocabCollapsed={collapsedVocab.has(idx)}
            onToggleVocabCollapsed={() => toggleSentenceVocab(idx)}
          />
        ))}
      </ol>
      <StudyActions
        sentences={sentences}
        sessionTitle={currentSession?.title ?? ""}
        onStartQuiz={onStartQuiz}
      />
      {returnIdx !== null && (
        <div
          className="vocab-return-btn fixed bottom-6 left-1/2 z-50"
          onMouseUp={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Button
            type="primary"
            shape="round"
            icon={<ArrowUpOutlined />}
            onClick={returnToSentence}
            className="bg-(--accent)! border-(--accent)! text-white! shadow-lg"
          >
            回到原句
          </Button>
        </div>
      )}
      <div
        onMouseUp={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <SelectionMenu
          open={menuOpen}
          x={menuPos.x}
          y={menuPos.y}
          options={vocab.options}
          setOptions={vocab.setOptions}
          onLookUp={onLookUp}
          onCancel={closeMenu}
          loading={vocab.loading}
        />
      </div>
    </div>
  );
}
