import { Typography, Divider } from "antd";
import { useTranslation } from "../context/translationContext";
const { Text } = Typography;

export default function TranslationsList() {
  const {
    state: { sentences },
  } = useTranslation();

  if (!sentences.length) {
    return <Text type="secondary">No translations yet.</Text>;
  }
  return (
    <ol className="list-decimal pl-5 space-y-3">
      {sentences.map((s, idx) => (
        <li key={idx}>
          <div>
            <Text type="secondary" strong>
              Original:
            </Text>{" "}
            <Text type="secondary">{s.original}</Text>
          </div>
          <div>
            <Text strong>Translation:</Text> <Text>{s.translation}</Text>
          </div>
          <Divider />
        </li>
      ))}
    </ol>
  );
}
