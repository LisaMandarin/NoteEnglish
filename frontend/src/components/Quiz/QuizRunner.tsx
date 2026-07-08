import { useState } from "react";
import { Progress } from "antd";
import type { QuizAnswerRecord, QuizQuestion } from "../../types";
import QuizQuestionCard from "./QuizQuestionCard";
import QuizResult from "./QuizResult";

// Runs a prepared question list: progress bar → question cards → result
// screen. Shared by the article quiz (QuizView) and 今日複習 (ReviewQuiz);
// remount with a fresh `key` to restart.
export default function QuizRunner({
  questions,
  onFinished,
  onRetry,
  onReconfigure,
  onExit,
}: {
  questions: QuizQuestion[];
  // Called once with every record when the user reaches the result screen.
  onFinished?: (records: QuizAnswerRecord[]) => void;
  onRetry: () => void;
  // Omit to hide the 重新設定 button (review mode has no setup screen).
  onReconfigure?: () => void;
  onExit: () => void;
}): React.ReactElement {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [records, setRecords] = useState<QuizAnswerRecord[]>([]);
  const [finished, setFinished] = useState(false);

  function handleAnswered(record: QuizAnswerRecord): void {
    setRecords((prev) => [...prev, record]);
  }

  function handleNext(): void {
    if (currentIndex + 1 >= questions.length) {
      setFinished(true);
      onFinished?.(records);
    } else {
      setCurrentIndex((i) => i + 1);
    }
  }

  if (finished) {
    return (
      <QuizResult
        records={records}
        onRetry={onRetry}
        onReconfigure={onReconfigure}
        onExit={onExit}
      />
    );
  }

  return (
    <div className="space-y-5">
      <Progress
        percent={Math.round((records.length / questions.length) * 100)}
        showInfo={false}
        strokeColor="var(--accent)"
      />
      <QuizQuestionCard
        key={currentIndex}
        question={questions[currentIndex]}
        index={currentIndex}
        total={questions.length}
        onAnswered={handleAnswered}
        onNext={handleNext}
      />
    </div>
  );
}
