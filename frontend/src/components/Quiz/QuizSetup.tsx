import { useState } from "react";
import { Button, Checkbox, InputNumber, Radio } from "antd";
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

// value 0 stands for "no cap" (Radio values must be non-null). A cap is only
// offered when the selected types can actually produce more than that many.
const LIMIT_STEPS = [10, 20];

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
  // null until the user picks a number; then it caps how many dictation
  // questions get drawn from the eligible sentences.
  const [dictationCount, setDictationCount] = useState<number | null>(null);

  const dictationSelected = selectedTypes.includes("dictation");
  const effectiveDictation = Math.min(dictationCount ?? counts.dictation, counts.dictation);
  const totalSelected = selectedTypes.reduce((sum, key) => {
    if (key === "comprehension") return sum;
    if (key === "dictation") return sum + effectiveDictation;
    return sum + counts[key];
  }, 0);
  const comprehensionSelected = selectedTypes.includes("comprehension");
  const canStart = totalSelected > 0 || comprehensionSelected;

  // Only caps smaller than the available total make sense as choices; when the
  // stored choice is no longer offered (types were deselected), fall back to 全部.
  const limitChoices = LIMIT_STEPS.filter((step) => step < totalSelected);
  const effectiveLimit = limitChoices.includes(limit) ? limit : 0;

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
      questionLimit: effectiveLimit === 0 ? null : effectiveLimit,
      dictationLimit: dictationSelected ? effectiveDictation : null,
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
              {row.key === "dictation" && dictationSelected && counts.dictation > 1 && (
                <span className="flex items-center gap-1 text-sm">
                  本次出
                  <InputNumber
                    size="small"
                    min={1}
                    max={counts.dictation}
                    value={effectiveDictation}
                    onChange={(value: number | null) => setDictationCount(value)}
                    style={{ width: 60 }}
                    aria-label="聽寫題數"
                  />
                  題
                </span>
              )}
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

      {totalSelected > 0 && (
        <div>
          <h3 className="mb-3 text-base font-semibold">題數</h3>
          {limitChoices.length > 0 ? (
            <Radio.Group
              value={effectiveLimit}
              onChange={(e) => setLimit(e.target.value as number)}
              options={[
                ...limitChoices.map((step) => ({ label: `${step} 題`, value: step })),
                { label: `全部（${totalSelected} 題）`, value: 0 },
              ]}
              optionType="button"
            />
          ) : (
            <p className="m-0 text-sm opacity-70">共 {totalSelected} 題，全部出題</p>
          )}
          {comprehensionSelected && (
            <p className="m-0 mt-2 text-sm opacity-60">閱讀理解題不計入題數，會全部出現</p>
          )}
        </div>
      )}

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
