import { useRef } from "react";
import { Typography } from "antd";
import { useTranslation } from "../context/translationContext";
import SelectionMenu from "./SelectionMenu";
import { useVocabLookup } from "../hooks/useVocabLookup";
import { useSelectionMenu } from "../hooks/useSelectionMenu";
import SentenceItem from "./SentenceItem";
import SummaryExportBar from "./SummaryExportBar";
const { Text } = Typography;

export default function TranslationsList(): React.ReactElement {
  const {
    state: { sentences, saving, currentSession },
    actions: { updateSentenceVocab, removeSentenceVocab, reorderSentenceVocab },
  } = useTranslation();

  const containerRef = useRef<HTMLDivElement>(null);
  const vocab = useVocabLookup(sentences, updateSentenceVocab, currentSession?.id ?? null);
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
    const ok = await vocab.lookup();
    if (ok) {
      closeMenu();
      clearSelection();
    }
  }

  if (!sentences.length) {
    return <Text type="secondary">No translations yet.</Text>;
  }

  const hasAnyVocab = sentences.some((s) => Array.isArray(s.vocab) && s.vocab.length > 0);

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
        <div className="absolute inset-0 z-10 rounded-lg bg-white/50 backdrop-blur-[1px] flex items-start justify-end pr-3 pt-2 pointer-events-auto">
          <span className="text-xs text-gray-400 animate-pulse">儲存中...</span>
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
          />
        ))}
      </ol>
      <SummaryExportBar sentences={sentences} sessionTitle={currentSession?.title ?? ""} />
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
