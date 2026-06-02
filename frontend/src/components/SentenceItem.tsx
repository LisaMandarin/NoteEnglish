import { Typography } from "antd";
import { SoundOutlined } from "@ant-design/icons";
import type { Sentence, VocabItem } from "../types";
import VocabCards from "./VocabCards";
import { speak } from "../lib/speech";
const { Text } = Typography;

export default function SentenceItem({ sentence, idx, onDelete, onReorder }: {
  sentence: Sentence;
  idx: number;
  onDelete?: (sentenceIdx: number, lemma: string, pos: string) => void;
  onReorder?: (sentenceIdx: number, newVocab: VocabItem[]) => void;
}): React.ReactElement {
  return (
    <li data-idx={idx} className="flex gap-4">
      <div className="w-7 h-7 rounded-full bg-(--accent) text-white flex items-center justify-center shrink-0 font-bold text-sm mt-0.5">
        {idx + 1}
      </div>
      <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => speak(sentence.original)}
          className="text-gray-400 hover:text-(--accent) transition-colors cursor-pointer"
          aria-label="Pronounce sentence"
        >
          <SoundOutlined />
        </button>
        <Text strong style={{ fontSize: "1.25rem" }}>
          {sentence.original}
        </Text>
      </div>
      <div className="select-none">
        <Text type="secondary">{sentence.translation}</Text>
      </div>
      <VocabCards
        vocab={sentence.vocab}
        sentenceIdx={idx}
        onDelete={onDelete}
        onReorder={onReorder}
      />
      </div>
    </li>
  );
}
