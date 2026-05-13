import { Typography } from "antd";
import VocabCards from "./VocabCards";
const { Text } = Typography;

export default function SentenceItem({ sentence, idx, onDelete, onReorder }) {
  return (
    <li data-idx={idx}>
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
    </li>
  );
}
