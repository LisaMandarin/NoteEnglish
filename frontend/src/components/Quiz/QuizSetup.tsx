import { useState } from "react";
import { Button, Checkbox, Radio } from "antd";
import type { QuizTypeKey, SpellingMode } from "../../types";
import type { QuizConfig } from "../../lib/quiz";

const TYPE_ROWS: { key: QuizTypeKey; label: string; description: string }[] = [
  { key: "cloze", label: "克漏字", description: "把文章句子挖空，選出正確的單字" },
  { key: "matching", label: "字義配對", description: "選出單字的中文意思" },
  { key: "spelling", label: "拼字", description: "依中文釋義拼出英文單字" },
];

// value 0 stands for "no cap" (Radio values must be non-null).
const LIMIT_OPTIONS: { label: string; value: number }[] = [
  { label: "10 題", value: 10 },
  { label: "20 題", value: 20 },
  { label: "全部", value: 0 },
];

export default function QuizSetup({
  counts,
  onStart,
}: {
  counts: Record<QuizTypeKey, number>;
  onStart: (config: QuizConfig) => void;
}): React.ReactElement {
  const [selectedTypes, setSelectedTypes] = useState<QuizTypeKey[]>(
    () => TYPE_ROWS.map((row) => row.key).filter((key) => counts[key] > 0),
  );
  const [spellingMode, setSpellingMode] = useState<SpellingMode>("scramble");
  const [limit, setLimit] = useState<number>(10);

  const totalSelected = selectedTypes.reduce((sum, key) => sum + counts[key], 0);

  function toggleType(key: QuizTypeKey, checked: boolean): void {
    setSelectedTypes((prev) =>
      checked ? [...prev, key] : prev.filter((t) => t !== key),
    );
  }

  function handleStart(): void {
    if (totalSelected === 0) return;
    onStart({
      types: selectedTypes,
      spellingMode,
      questionLimit: limit === 0 ? null : limit,
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <h3 className="mb-3 text-base font-semibold">題型</h3>
        <div className="space-y-3">
          {TYPE_ROWS.map((row) => (
            <div key={row.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <Checkbox
                checked={selectedTypes.includes(row.key)}
                disabled={counts[row.key] === 0}
                onChange={(e) => toggleType(row.key, e.target.checked)}
              >
                <span className="font-medium">{row.label}</span>
                <span className="ml-2 text-sm opacity-60">
                  {counts[row.key] > 0 ? `${counts[row.key]} 題` : "無可出題的單字"}
                </span>
              </Checkbox>
              <span className="text-sm opacity-60">{row.description}</span>
            </div>
          ))}
        </div>
      </div>

      {selectedTypes.includes("spelling") && (
        <div>
          <h3 className="mb-3 text-base font-semibold">拼字方式</h3>
          <Radio.Group
            value={spellingMode}
            onChange={(e) => setSpellingMode(e.target.value as SpellingMode)}
            options={[
              { label: "字母重組（點選字母排出單字）", value: "scramble" },
              { label: "打字（自行輸入完整拼法）", value: "typing" },
            ]}
          />
        </div>
      )}

      <div>
        <h3 className="mb-3 text-base font-semibold">題數</h3>
        <Radio.Group
          value={limit}
          onChange={(e) => setLimit(e.target.value as number)}
          options={LIMIT_OPTIONS}
          optionType="button"
        />
      </div>

      <Button type="primary" size="large" disabled={totalSelected === 0} onClick={handleStart}>
        開始測驗
      </Button>
    </div>
  );
}
