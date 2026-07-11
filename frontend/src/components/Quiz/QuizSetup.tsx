import { useState } from "react";
import { Button, Checkbox, InputNumber, Radio, Steps } from "antd";
import {
  BookOutlined,
  FileTextOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import type { QuizTypeKey, SpellingMode } from "../../types";
import type { QuizConfig } from "../../lib/quiz";

type FrontendTypeKey = Exclude<QuizTypeKey, "comprehension">;
type CategoryKey = "word" | "article";

const CATEGORY_INFO: {
  key: CategoryKey;
  title: string;
  icon: React.ReactNode;
  source: string;
  proficiency: string;
}[] = [
  {
    key: "word",
    title: "單字/片語測驗",
    icon: <BookOutlined aria-hidden="true" />,
    source: "出題來源：你在這篇文章查過的單字和片語",
    proficiency: "完成後更新「單字熟練度」",
  },
  {
    key: "article",
    title: "閱讀理解測驗",
    icon: <FileTextOutlined aria-hidden="true" />,
    source: "出題來源：整篇文章的內容",
    proficiency: "完成後更新「文章熟練度」",
  },
];

const TYPE_ROWS: { key: QuizTypeKey; category: CategoryKey; label: string; description: string }[] = [
  { key: "cloze", category: "word", label: "克漏字", description: "把文章句子中你查過的單字挖空，四選一" },
  { key: "matching", category: "word", label: "字義配對", description: "從你查過的單字出題，選出正確的中文意思" },
  { key: "spelling", category: "word", label: "拼字", description: "看中文意思或聽發音，拼出你查過的單字" },
  { key: "dictation", category: "article", label: "聽寫", description: "播放文章句子的錄音，寫出完整句子" },
  { key: "comprehension", category: "article", label: "閱讀理解", description: "AI 根據整篇文章出 3–5 題選擇題，題目會保存" },
];

// value 0 stands for "no cap" (Radio values must be non-null). A cap is only
// offered when the selected types can actually produce more than that many.
const LIMIT_STEPS = [10, 20];

export type ComprehensionSetupState = {
  // False when the article has no saved session yet — translation auto-saves,
  // so this only happens when that auto-save failed.
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
  const wordTotal = counts.cloze + counts.matching + counts.spelling;
  const categoryAvailable: Record<CategoryKey, boolean> = {
    word: wordTotal > 0,
    article: counts.dictation > 0 || comprehension.available,
  };

  const [step, setStep] = useState(0);
  const [selectedCategories, setSelectedCategories] = useState<CategoryKey[]>(() =>
    CATEGORY_INFO.map((c) => c.key).filter((key) => categoryAvailable[key]),
  );
  // Starts empty on purpose: the user picks question types explicitly.
  const [selectedTypes, setSelectedTypes] = useState<QuizTypeKey[]>([]);
  const [spellingMode, setSpellingMode] = useState<SpellingMode>("scramble");
  const [limit, setLimit] = useState<number>(10);
  // null until the user picks a number; then it caps how many dictation
  // questions get drawn from the eligible sentences.
  const [dictationCount, setDictationCount] = useState<number | null>(null);

  // Only types belonging to a selected category count toward the quiz.
  const activeTypes = selectedTypes.filter((key) =>
    selectedCategories.includes(TYPE_ROWS.find((row) => row.key === key)!.category),
  );

  const dictationSelected = activeTypes.includes("dictation");
  const effectiveDictation = Math.min(dictationCount ?? counts.dictation, counts.dictation);
  const totalSelected = activeTypes.reduce((sum, key) => {
    if (key === "comprehension") return sum;
    if (key === "dictation") return sum + effectiveDictation;
    return sum + counts[key as FrontendTypeKey];
  }, 0);
  const comprehensionSelected = activeTypes.includes("comprehension");
  const canStart = totalSelected > 0 || comprehensionSelected;

  // Only caps smaller than the available total make sense as choices; when the
  // stored choice is no longer offered (types were deselected), fall back to 全部.
  const limitChoices = LIMIT_STEPS.filter((s) => s < totalSelected);
  const effectiveLimit = limitChoices.includes(limit) ? limit : 0;

  function typeAvailable(key: QuizTypeKey): boolean {
    if (key === "comprehension") return comprehension.available;
    return counts[key as FrontendTypeKey] > 0;
  }

  function toggleCategory(key: CategoryKey): void {
    if (!categoryAvailable[key]) return;
    const isOn = selectedCategories.includes(key);
    setSelectedCategories((prev) => (isOn ? prev.filter((c) => c !== key) : [...prev, key]));
    if (isOn) {
      // Dropping a category clears its type picks so re-selecting starts fresh.
      const catTypes = TYPE_ROWS.filter((row) => row.category === key).map((row) => row.key);
      setSelectedTypes((prev) => prev.filter((t) => !catTypes.includes(t)));
    }
  }

  function toggleType(key: QuizTypeKey, checked: boolean): void {
    setSelectedTypes((prev) =>
      checked ? [...prev, key] : prev.filter((t) => t !== key),
    );
  }

  function handleStart(): void {
    if (!canStart || starting) return;
    onStart({
      types: activeTypes,
      spellingMode,
      questionLimit: effectiveLimit === 0 ? null : effectiveLimit,
      dictationLimit: dictationSelected ? effectiveDictation : null,
    });
  }

  function renderTypeRow(row: (typeof TYPE_ROWS)[number]): React.ReactElement {
    const available = typeAvailable(row.key);
    const unavailableReason =
      row.key === "comprehension"
        ? "文章自動儲存失敗，回文章頁重新操作後才能出題"
        : row.key === "dictation"
          ? "沒有適合聽寫的句子"
          : "無可出題的單字";
    const countLabel =
      row.key === "comprehension"
        ? comprehension.count != null
          ? `${comprehension.count} 題`
          : "AI 出 3–5 題"
        : `${counts[row.key as FrontendTypeKey]} 題`;

    return (
      <div key={row.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Checkbox
          checked={selectedTypes.includes(row.key)}
          disabled={!available}
          onChange={(e) => toggleType(row.key, e.target.checked)}
        >
          <span className="font-medium">{row.label}</span>
          <span className="ml-2 text-sm opacity-60">
            {available ? countLabel : unavailableReason}
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
        {row.key === "comprehension" && comprehension.count != null && (
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
    );
  }

  return (
    <div className="space-y-8">
      <Steps
        size="small"
        current={step}
        items={[{ title: "選類別" }, { title: "選題型" }, { title: "確認開始" }]}
      />

      {step === 0 && (
        <div>
          <p className="m-0 mb-4 text-sm opacity-70">想測驗哪些內容？可以同時選兩種。</p>
          <div className="flex flex-col gap-4 md:flex-row">
            {CATEGORY_INFO.map((cat) => {
              const available = categoryAvailable[cat.key];
              const selected = selectedCategories.includes(cat.key);
              // Unavailable reason only; question counts stay hidden here.
              const noteLine = available
                ? null
                : cat.key === "word"
                  ? "還沒有查過單字，無法出題"
                  : "文章自動儲存失敗，回文章頁重新操作後才能出題";
              return (
                <div key={cat.key} className="flex flex-1 items-start gap-3">
                  <Checkbox
                    checked={selected}
                    disabled={!available}
                    onChange={() => toggleCategory(cat.key)}
                    aria-label={cat.title}
                    className="mt-4"
                  />
                  <button
                    type="button"
                    disabled={!available}
                    onClick={() => toggleCategory(cat.key)}
                    className={`flex-1 rounded-2xl border-2 p-4 text-left transition-colors ${
                      selected
                        ? "border-(--accent) bg-(--accent)/5"
                        : "border-(--card-border)/25 bg-white"
                    } ${available ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
                  >
                    <div className="mb-1 flex items-center gap-2 font-semibold">
                      {cat.icon}
                      {cat.title}
                    </div>
                    <p className="m-0 text-sm opacity-70">{cat.source}</p>
                    {noteLine && <p className="m-0 mt-1 text-sm opacity-70">{noteLine}</p>}
                    <p className="m-0 mt-2 text-xs text-(--accent)">{cat.proficiency}</p>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-6">
          {CATEGORY_INFO.filter((cat) => selectedCategories.includes(cat.key)).map((cat) => (
            <div
              key={cat.key}
              className="rounded-2xl border border-(--panel-border) bg-(--panel-bg) p-4 sm:p-5"
            >
              <h3 className="mt-0 mb-3 flex items-center gap-2 text-base font-semibold">
                {cat.icon}
                {cat.title}
              </h3>
              <div className="space-y-3">
                {TYPE_ROWS.filter((row) => row.category === cat.key).map(renderTypeRow)}
              </div>
              {cat.key === "word" && activeTypes.includes("spelling") && (
                <div className="mt-4">
                  <h4 className="mb-2 text-sm font-semibold">拼字方式</h4>
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
            </div>
          ))}
          {!canStart && (
            <p className="m-0 text-sm opacity-60">至少勾選一種題型才能繼續。</p>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h3 className="mb-3 text-base font-semibold">已選題型</h3>
            <div className="flex flex-wrap gap-2">
              {TYPE_ROWS.filter((row) => activeTypes.includes(row.key)).map((row) => (
                <span
                  key={row.key}
                  className="rounded-full border border-(--card-border)/30 bg-white px-3 py-1 text-sm"
                >
                  {row.label}
                  <span className="ml-1.5 opacity-60">
                    {row.key === "comprehension"
                      ? comprehension.count != null
                        ? `${comprehension.count} 題`
                        : "3–5 題"
                      : row.key === "dictation"
                        ? `${effectiveDictation} 題`
                        : `${counts[row.key as FrontendTypeKey]} 題`}
                  </span>
                </span>
              ))}
            </div>
          </div>

          {totalSelected > 0 && (
            <div>
              <h3 className="mb-3 text-base font-semibold">題數</h3>
              {limitChoices.length > 0 ? (
                <Radio.Group
                  value={effectiveLimit}
                  onChange={(e) => setLimit(e.target.value as number)}
                  options={[
                    ...limitChoices.map((s) => ({ label: `隨機 ${s} 題`, value: s })),
                    { label: `全部（${totalSelected} 題）`, value: 0 },
                  ]}
                  optionType="button"
                />
              ) : (
                <p className="m-0 text-sm opacity-70">共 {totalSelected} 題，隨機排序全部出題</p>
              )}
              {comprehensionSelected && (
                <p className="m-0 mt-2 text-sm opacity-60">閱讀理解題不計入題數，會全部出現</p>
              )}
            </div>
          )}

          {/* How the two session-card proficiency scores are computed */}
          <div className="rounded-xl border border-(--card-border) bg-(--card-bg) p-4 text-sm">
            <h3 className="m-0 mb-2 flex items-center gap-1.5 text-sm font-semibold">
              <InfoCircleOutlined aria-hidden="true" />
              熟練度計算方式
            </h3>
            <ul className="m-0 list-none space-y-1 p-0 opacity-80">
              <li>
                <FileTextOutlined aria-hidden="true" className="mr-1.5 text-(--accent)" />
                文章熟練度＝最近一次測驗中「閱讀理解、聽寫」的答對率
              </li>
              <li>
                <BookOutlined aria-hidden="true" className="mr-1.5 text-(--accent)" />
                單字熟練度＝最近一次測驗中「克漏字、字義配對、拼字」的答對率
              </li>
              <li>只採計最近一次的成績，重新測驗就會更新，分數顯示在首頁和歷史紀錄的文章卡片上。</li>
              <li>單字在兩種不同題型都答對過會標示「已掌握」，答錯則回到「學習中」。</li>
            </ul>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        {step > 0 && (
          <Button onClick={() => setStep((s) => s - 1)} disabled={starting}>
            上一步
          </Button>
        )}
        {step < 2 && (
          <Button
            type="primary"
            onClick={() => setStep((s) => s + 1)}
            disabled={step === 0 ? selectedCategories.length === 0 : !canStart}
          >
            下一步
          </Button>
        )}
        {step === 2 && (
          <Button
            type="primary"
            size="large"
            disabled={!canStart}
            loading={starting}
            onClick={handleStart}
          >
            開始測驗
          </Button>
        )}
      </div>
    </div>
  );
}
