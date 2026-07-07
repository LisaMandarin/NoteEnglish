import { Button, Progress } from "antd";
import type { QuizAnswerRecord, QuizQuestion } from "../../types";

function promptOf(question: QuizQuestion): string {
  if (question.kind === "cloze") return question.sentenceWithBlank;
  if (question.kind === "matching") return question.vocab.lemma || question.vocab.text;
  if (question.kind === "spelling") {
    return (question.vocab.translation ?? "").trim() || (question.vocab.definition ?? "").trim();
  }
  if (question.kind === "dictation") return question.translation || "聽寫句子";
  return question.question;
}

function correctAnswerOf(question: QuizQuestion): string {
  if (question.kind === "spelling" || question.kind === "dictation") return question.answer;
  return question.options[question.answerIndex];
}

export default function QuizResult({
  records,
  onRetry,
  onReconfigure,
  onExit,
}: {
  records: QuizAnswerRecord[];
  onRetry: () => void;
  onReconfigure: () => void;
  onExit: () => void;
}): React.ReactElement {
  const correctCount = records.filter((r) => r.correct).length;
  const percent = records.length === 0 ? 0 : Math.round((correctCount / records.length) * 100);
  const wrongRecords = records.filter((r) => !r.correct);

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-center gap-3 py-2">
        <Progress
          type="circle"
          percent={percent}
          strokeColor="var(--accent)"
          format={() => `${percent}%`}
        />
        <p className="m-0 text-lg font-medium">
          答對 {correctCount} / {records.length} 題
        </p>
        <p className="m-0 text-sm opacity-60">
          {percent === 100
            ? "太棒了，全部答對！"
            : percent >= 80
              ? "表現很好，錯的再複習一下就完美了！"
              : "別氣餒，看看下面的錯題，複習後再挑戰一次！"}
        </p>
      </div>

      {wrongRecords.length > 0 && (
        <div>
          <h3 className="mb-3 text-base font-semibold">錯題複習</h3>
          <ul className="m-0 list-none space-y-3 p-0">
            {wrongRecords.map((record, idx) => (
              <li
                key={idx}
                className="rounded-xl border-2 border-(--card-border)/20 px-4 py-3"
              >
                <p className="m-0 mb-1 text-base">{promptOf(record.question)}</p>
                <p className="m-0 text-sm">
                  <span className="text-(--quiz-correct)">正確答案：{correctAnswerOf(record.question)}</span>
                  <span className="ml-4 text-(--quiz-wrong)">你的答案：{record.userAnswer}</span>
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="primary" size="large" onClick={onRetry}>
          再測一次
        </Button>
        <Button size="large" onClick={onReconfigure}>
          重新設定
        </Button>
        <Button size="large" onClick={onExit}>
          返回文章
        </Button>
      </div>
    </div>
  );
}
