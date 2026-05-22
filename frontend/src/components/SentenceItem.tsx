import { Typography } from "antd";
import VocabCards from "./VocabCards";
const { Text } = Typography;

export default function SentenceItem({ sentence, idx, onDelete, onReorder }) {
  return (
    <li data-idx={idx} className="flex gap-4">
      <div className="w-7 h-7 rounded-full bg-(--accent) text-white flex items-center justify-center shrink-0 font-bold text-sm mt-0.5">
        {idx + 1}
      </div>
      <div className="flex-1 min-w-0">
      <div>
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
