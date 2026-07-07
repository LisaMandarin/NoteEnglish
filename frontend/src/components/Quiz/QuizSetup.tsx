import { useState } from "react";
import { Button, Checkbox, Radio } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import type { QuizTypeKey, SpellingMode } from "../../types";
import type { QuizConfig } from "../../lib/quiz";

type FrontendTypeKey = Exclude<QuizTypeKey, "comprehension">;

const TYPE_ROWS: { key: FrontendTypeKey; label: string; description: string }[] = [
  { key: "cloze", label: "克漏字", description: "把文章句子挖空，選出正確的單字" },
  { key: "matching", label: "字義配對", description: "選出單字的中文意思" },
  { key: "spelling", label: "拼字", description: "聽發音、看中文釋義，拼出英文單字" },
  { key: "dictation", label: "聽寫", description: "聽句子錄音，寫出完整句子" },
];

// value 0 stands for "no cap" (Radio values must be non-null).
const LIMIT_OPTIONS: { label: string; value: number }[] = [
  { label: "10 題", value: 10 },
  { label: "20 題", value: 20 },
  { label: "全部", value: 0 },
];

export type ComprehensionSetupState = {
  // False when the article has no saved session yet (AI questions need one).
  available: boolean;
  // Cached question count from a previous generate; null before the first one.
  count: number | null;
  regenerating: boolean;
  onRegenerate: () => void;
};

export default function QuizSetup({
  counts,
  comprehension,
  starting,
  onStart,
}: {
  counts: Record<FrontendTypeKey, number>;
  comprehension: ComprehensionSetupState;
  // True while AI questions are being generated for quiz start.
  starting: boolean;
  onStart: (config: QuizConfig) => void;
}): React.ReactElement {
  const [selectedTypes, setSelectedTypes] = useState<QuizTypeKey[]>(
    () => TYPE_ROWS.map((row) => row.key).filter((key) => counts[key] > 0),
  );
  const [spellingMode, setSpellingMode] = useState<SpellingMode>("scramble");
  const [limit, setLimit] = useState<number>(10);

  const totalSelected = selectedTypes.reduce(
    (sum, key) => (key === "comprehension" ? sum : sum + counts[key]),
    0,
  );
  const comprehensionSelected = selectedTypes.includes("comprehension");
  const canStart = totalSelected > 0 || comprehensionSelected;

  function toggleType(key: QuizTypeKey, checked: boolean): void {
    setSelectedTypes((prev) =>
      checked ? [...prev, key] : prev.filter((t) => t !== key),
    );
  }

  function handleStart(): void {
    if (!canStart || starting) return;
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
                  {counts[row.key] > 0
                    ? `${counts[row.key]} 題`
                    : row.key === "dictation"
                      ? "沒有適合聽寫的句子"
                      : "無可出題的單字"}
                </span>
              </Checkbox>
              <span className="text-sm opacity-60">{row.description}</span>
            </div>
          ))}

          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <Checkbox
              checked={comprehensionSelected}
              disabled={!comprehension.available}
              onChange={(e) => toggleType("comprehension", e.target.checked)}
            >
              <span className="font-medium">閱讀理解</span>
              <span className="ml-2 text-sm opacity-60">
                {!comprehension.available
                  ? "文章儲存後才能出題"
                  : comprehension.count != null
                    ? `${comprehension.count} 題`
                    : "AI 出 3–5 題"}
              </span>
            </Checkbox>
            <span className="text-sm opacity-60">AI 根據文章內容出選擇題，題目會保存下來</span>
            {comprehension.count != null && (
              <Button
                size="small"
                icon={<ReloadOutlined />}
                loading={comprehension.regenerating}
                onClick={comprehension.onRegenerate}
              >
                重新出題
              </Button>
            )}
          </div>
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
        {comprehensionSelected && (
          <p className="m-0 mt-2 text-sm opacity-60">閱讀理解題不計入題數，會全部出現</p>
        )}
      </div>

      <Button
        type="primary"
        size="large"
        disabled={!canStart}
        loading={starting}
        onClick={handleStart}
      >
        開始測驗
      </Button>
    </div>
  );
}
