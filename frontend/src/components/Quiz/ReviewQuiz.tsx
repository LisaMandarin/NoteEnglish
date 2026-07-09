import { useEffect, useState } from "react";
import { Button, message } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { getReviewWords, submitQuizResults } from "../../lib/api";
import { buildReviewQuiz, toResultPayload } from "../../lib/quiz";
import { invalidateWordMastery } from "../../lib/mastery";
import type { QuizAnswerRecord, QuizQuestion, VocabItem } from "../../types";
import QuizRunner from "./QuizRunner";

// 今日複習: a zero-setup quiz over the words whose spaced-repetition review is
// due, mixed across articles (matching + scramble spelling).
export default function ReviewQuiz({ onExit }: { onExit: () => void }): React.ReactElement {
  const [words, setWords] = useState<VocabItem[] | null>(null);
  const [error, setError] = useState("");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    let mounted = true;
    getReviewWords()
      .then((items) => {
        if (!mounted) return;
        const vocab: VocabItem[] = items.map((item) => ({
          text: item.text ?? item.lemma,
          lemma: item.lemma,
          pos: item.pos ?? "",
          translation: item.translation ?? undefined,
          definition: item.definition ?? undefined,
        }));
        setWords(vocab);
        setQuestions(buildReviewQuiz(vocab, "scramble"));
        setRunId((id) => id + 1);
      })
      .catch(() => {
        if (mounted) setError("無法載入今日複習的單字，請稍後再試。");
      });
    return () => {
      mounted = false;
    };
  }, []);

  function restart(): void {
    if (!words) return;
    setQuestions(buildReviewQuiz(words, "scramble"));
    setRunId((id) => id + 1);
  }

  async function submitResults(records: QuizAnswerRecord[]): Promise<void> {
    if (records.length === 0) return;
    try {
      // Review spans articles, so results carry no session.
      await submitQuizResults({ session_id: null, results: toResultPayload(records) });
      invalidateWordMastery();
    } catch {
      message.warning("複習結果未能存檔，但不影響本次成績顯示");
    }
  }

  return (
    <div className="rounded-[30px] border-4 border-(--card-border) bg-(--card-bg) shadow-md">
      <div className="w-full m-0 box-border px-8 py-10 sm:px-12">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="m-0 text-xl font-semibold">今日複習</h2>
            <p className="m-0 mt-1 text-sm opacity-60">到期的單字，跨文章混合出題</p>
          </div>
          <Button icon={<ArrowLeftOutlined />} onClick={onExit}>
            返回首頁
          </Button>
        </div>

        {error ? (
          <p className="m-0 text-base text-(--quiz-wrong)">{error}</p>
        ) : words == null ? (
          <p className="m-0 text-base opacity-70">正在準備今日複習⋯⋯</p>
        ) : questions.length === 0 ? (
          <p className="m-0 text-base opacity-70">
            今天沒有到期的單字，休息一下吧！測驗過的單字會依間隔自動排入複習。
          </p>
        ) : (
          <QuizRunner
            key={runId}
            questions={questions}
            onFinished={(records) => void submitResults(records)}
            onRetry={restart}
            onExit={onExit}
          />
        )}
      </div>
    </div>
  );
}
