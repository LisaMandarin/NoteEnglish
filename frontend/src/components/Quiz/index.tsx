import { useEffect, useMemo, useState } from "react";
import { Button, Progress, message } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useTranslation } from "../../context/translationContext";
import {
  buildQuiz,
  countAvailableQuestions,
  type QuizConfig,
} from "../../lib/quiz";
import { generateQuiz, getVocabPool, submitQuizResults } from "../../lib/api";
import type {
  ComprehensionQuizQuestion,
  QuizAnswerRecord,
  QuizQuestion,
  QuizResultPayloadItem,
  VocabItem,
} from "../../types";
import QuizSetup from "./QuizSetup";
import QuizQuestionCard from "./QuizQuestionCard";
import QuizResult from "./QuizResult";

type QuizPhase = "setup" | "running" | "result";

function toResultPayload(records: QuizAnswerRecord[]): QuizResultPayloadItem[] {
  return records.map((record) => {
    const question = record.question;
    const item: QuizResultPayloadItem = {
      quiz_type: question.kind,
      correct: record.correct,
    };
    if (question.kind === "cloze" || question.kind === "matching" || question.kind === "spelling") {
      item.lemma = question.vocab.lemma;
      item.pos = question.vocab.pos;
    }
    return item;
  });
}

export default function QuizView({ onExit }: { onExit: () => void }): React.ReactElement {
  const {
    state: { sentences, currentSession },
  } = useTranslation();
  const [phase, setPhase] = useState<QuizPhase>("setup");
  const [config, setConfig] = useState<QuizConfig | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [records, setRecords] = useState<QuizAnswerRecord[]>([]);
  // Cross-article distractor pool; empty until fetched (quiz works without it).
  const [vocabPool, setVocabPool] = useState<VocabItem[]>([]);
  // AI comprehension questions, cached for the visit once generated/fetched.
  const [comprehension, setComprehension] = useState<ComprehensionQuizQuestion[] | null>(null);
  const [starting, setStarting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const counts = useMemo(() => countAvailableQuestions(sentences), [sentences]);
  const hasAnyQuestion =
    counts.cloze + counts.matching + counts.spelling + counts.dictation > 0 ||
    currentSession != null;

  useEffect(() => {
    let mounted = true;
    getVocabPool()
      .then((items) => {
        if (!mounted) return;
        setVocabPool(
          items.map((item) => ({
            text: item.text ?? item.lemma,
            lemma: item.lemma,
            pos: item.pos ?? "",
            translation: item.translation ?? undefined,
          })),
        );
      })
      .catch(() => {
        // Distractors fall back to this article's vocab only.
      });
    return () => {
      mounted = false;
    };
  }, []);

  async function fetchComprehension(regenerate: boolean): Promise<ComprehensionQuizQuestion[]> {
    if (!currentSession) return [];
    const generated = await generateQuiz(currentSession.id, regenerate);
    const mapped: ComprehensionQuizQuestion[] = generated.map((q) => ({
      kind: "comprehension",
      question: q.question,
      options: q.options,
      answerIndex: q.answer_index,
      explanation: q.explanation || undefined,
    }));
    setComprehension(mapped);
    return mapped;
  }

  async function startQuiz(nextConfig: QuizConfig): Promise<void> {
    let comprehensionQuestions: ComprehensionQuizQuestion[] = [];
    if (nextConfig.types.includes("comprehension")) {
      setStarting(true);
      try {
        comprehensionQuestions = comprehension ?? (await fetchComprehension(false));
      } catch (e: unknown) {
        message.error(e instanceof Error ? e.message : "閱讀理解題產生失敗，請稍後再試。");
        setStarting(false);
        return;
      }
      setStarting(false);
    }

    const nextQuestions = buildQuiz(sentences, nextConfig, {
      extraVocab: vocabPool,
      comprehension: comprehensionQuestions,
    });
    if (nextQuestions.length === 0) return;
    setConfig(nextConfig);
    setQuestions(nextQuestions);
    setCurrentIndex(0);
    setRecords([]);
    setPhase("running");
  }

  async function handleRegenerate(): Promise<void> {
    if (regenerating) return;
    setRegenerating(true);
    try {
      const regenerated = await fetchComprehension(true);
      message.success(`已重新出了 ${regenerated.length} 題閱讀理解`);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "重新出題失敗，請稍後再試。");
    } finally {
      setRegenerating(false);
    }
  }

  async function submitResults(all: QuizAnswerRecord[]): Promise<void> {
    if (all.length === 0) return;
    try {
      await submitQuizResults({
        session_id: currentSession?.id ?? null,
        results: toResultPayload(all),
      });
    } catch {
      message.warning("測驗結果未能存檔，但不影響本次成績顯示");
    }
  }

  function handleQuestionDone(record: QuizAnswerRecord): void {
    const nextRecords = [...records, record];
    setRecords(nextRecords);
    if (currentIndex + 1 >= questions.length) {
      setPhase("result");
      void submitResults(nextRecords);
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
          <QuizSetup
            counts={counts}
            comprehension={{
              available: currentSession != null,
              count: comprehension?.length ?? null,
              regenerating,
              onRegenerate: () => void handleRegenerate(),
            }}
            starting={starting}
            onStart={(nextConfig) => void startQuiz(nextConfig)}
          />
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
            onRetry={() => config && void startQuiz(config)}
            onReconfigure={handleReconfigure}
            onExit={onExit}
          />
        )}
      </div>
    </div>
  );
}
