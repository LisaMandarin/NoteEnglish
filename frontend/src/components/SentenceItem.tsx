import { Typography } from "antd";
import { SoundOutlined } from "@ant-design/icons";
import type { Sentence, VocabItem } from "../types";
import VocabCards from "./VocabCards";
import { speak } from "../lib/speech";
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
}: {
  sentence: Sentence;
  idx: number;
  hideHint?: boolean;
  selectedRange?: SelectedRange | null;
  onDelete?: (sentenceIdx: number, lemma: string, pos: string) => void;
  onReorder?: (sentenceIdx: number, newVocab: VocabItem[]) => void;
  onEdit?: (sentenceIdx: number, vocabItem: VocabItem) => void;
}): React.ReactElement {
  return (
    <li data-idx={idx} className="flex flex-col gap-1 sm:flex-row sm:gap-4">
      <div className="w-7 h-7 rounded-full bg-(--accent) text-white flex items-center justify-center shrink-0 font-bold text-sm sm:mt-0.5">
        {idx + 1}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-row items-baseline gap-2">
          <div>
            <button
              type="button"
              onClick={() => speak(sentence.original)}
              className="text-gray-400 hover:text-(--accent) transition-colors cursor-pointer"
              aria-label="Pronounce sentence"
            >
              <SoundOutlined />
            </button>
          </div>
          <div>
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
