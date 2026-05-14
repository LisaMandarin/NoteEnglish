import { useRef } from "react";
import { Typography } from "antd";
import { useTranslation } from "../context/translationContext";
import SelectionMenu from "./SelectionMenu";
import { useVocabLookup } from "../hooks/useVocabLookup";
import { useSelectionMenu } from "../hooks/useSelectionMenu";
import SentenceItem from "./SentenceItem";
import SummaryExportBar from "./SummaryExportBar";
const { Text } = Typography;

export default function TranslationsList() {
  const {
    state: { sentences, saving },
    actions: { updateSentenceVocab, removeSentenceVocab, reorderSentenceVocab },
  } = useTranslation();

  const containerRef = useRef(null);
  const vocab = useVocabLookup(sentences, updateSentenceVocab);
  const { menuOpen, menuPos, handleMouseUp, closeMenu, clearSelection } =
    useSelectionMenu({ containerRef, vocab });

  async function onLookUp() {
    const ok = await vocab.lookup();
    if (ok) {
      closeMenu();
      clearSelection();
    }
  }

  if (!sentences.length) {
    return <Text type="secondary">No translations yet.</Text>;
  }

  return (
    <div ref={containerRef} onMouseUp={handleMouseUp} className="relative">
      {saving && (
        <div className="absolute inset-0 z-10 rounded-lg bg-white/50 backdrop-blur-[1px] flex items-start justify-end pr-3 pt-2 pointer-events-auto">
          <span className="text-xs text-gray-400 animate-pulse">儲存中...</span>
        </div>
      )}
      <ol className="list-decimal pl-5 space-y-8">
        {sentences.map((s, idx) => (
          <SentenceItem
            key={idx}
            sentence={s}
            idx={idx}
            onDelete={removeSentenceVocab}
            onReorder={reorderSentenceVocab}
          />
        ))}
      </ol>
      <div className="mt-2 bg-(--bg-main) rounded-2xl p-4 shadow-lg">
        <Text strong>How to look up怎麼查詢:</Text>
        <ol className="list-decimal pl-5 mt-1">
          <li><Text>Select text in the Original sentence.選英文字</Text></li>
          <li><Text>Wait for the menu to pop up.等選單出現</Text></li>
          <li><Text>Tick the boxes you want.勾選要的項目</Text></li>
          <li><Text>Click Look Up.按「查詢」</Text></li>
        </ol>
      </div>
      <SummaryExportBar sentences={sentences} />
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
