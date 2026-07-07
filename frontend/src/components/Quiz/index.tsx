import { useMemo, useState } from "react";
import { Button, Progress } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useTranslation } from "../../context/translationContext";
import { buildQuiz, countAvailableQuestions, type QuizConfig } from "../../lib/quiz";
import type { QuizAnswerRecord, QuizQuestion } from "../../types";
import QuizSetup from "./QuizSetup";
import QuizQuestionCard from "./QuizQuestionCard";
import QuizResult from "./QuizResult";

type QuizPhase = "setup" | "running" | "result";

export default function QuizView({ onExit }: { onExit: () => void }): React.ReactElement {
  const {
    state: { sentences, currentSession },
  } = useTranslation();
  const [phase, setPhase] = useState<QuizPhase>("setup");
  const [config, setConfig] = useState<QuizConfig | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [records, setRecords] = useState<QuizAnswerRecord[]>([]);

  const counts = useMemo(() => countAvailableQuestions(sentences), [sentences]);
  const hasAnyQuestion = counts.cloze + counts.matching + counts.spelling > 0;

  function startQuiz(nextConfig: QuizConfig): void {
    const nextQuestions = buildQuiz(sentences, nextConfig);
    if (nextQuestions.length === 0) return;
    setConfig(nextConfig);
    setQuestions(nextQuestions);
    setCurrentIndex(0);
    setRecords([]);
    setPhase("running");
  }

  function handleQuestionDone(record: QuizAnswerRecord): void {
    setRecords((prev) => [...prev, record]);
    if (currentIndex + 1 >= questions.length) {
      setPhase("result");
    } else {
      setCurrentIndex((i) => i + 1);
    }
  }

  function handleReconfigure(): void {
    setPhase("setup");
    setQuestions([]);
    setRecords([]);
    setCurrentIndex(0);
  }

  return (
    <div className="rounded-[30px] border-4 border-(--card-border) bg-(--card-bg) shadow-md">
      <div className="w-full m-0 box-border px-8 py-10 sm:px-12">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="m-0 text-xl font-semibold">單字測驗</h2>
            {currentSession?.title && (
              <p className="m-0 mt-1 text-sm opacity-60">{currentSession.title}</p>
            )}
          </div>
          <Button icon={<ArrowLeftOutlined />} onClick={onExit}>
            返回文章
          </Button>
        </div>

        {!hasAnyQuestion ? (
          <p className="m-0 text-base opacity-70">
            這篇文章還沒有可以出題的單字。先在文章中選取單字加入筆記，再回來測驗吧！
          </p>
        ) : phase === "setup" ? (
          <QuizSetup counts={counts} onStart={startQuiz} />
        ) : phase === "running" ? (
          <div className="space-y-5">
            <Progress
              percent={Math.round((currentIndex / questions.length) * 100)}
              showInfo={false}
              strokeColor="var(--accent)"
            />
            <QuizQuestionCard
              key={currentIndex}
              question={questions[currentIndex]}
              index={currentIndex}
              total={questions.length}
              onDone={handleQuestionDone}
            />
          </div>
        ) : (
          <QuizResult
            records={records}
            onRetry={() => config && startQuiz(config)}
            onReconfigure={handleReconfigure}
            onExit={onExit}
          />
        )}
      </div>
    </div>
  );
}
