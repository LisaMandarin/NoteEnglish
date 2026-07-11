import { useMemo, useState } from "react";
import { Button, Input, Tag } from "antd";
import type {
  DictationQuestion,
  QuizAnswerRecord,
  QuizQuestion,
  SpellingQuestion,
} from "../../types";
import { diffDictation, KIND_LABELS, type DiffToken } from "../../lib/quiz";
import QuizAudioButton from "./QuizAudioButton";
import QuizAudioPlayer from "./QuizAudioPlayer";

function PosBadge({ pos }: { pos?: string }): React.ReactElement | null {
  if (!pos) return null;
  return (
    <span className="rounded-full bg-(--accent)/15 px-2 py-0.5 text-xs text-(--accent)">
      {pos}
    </span>
  );
}

// State colors live in index.css (.quiz-choice*) because antd's unlayered
// reset overrides Tailwind color utilities on plain buttons.
function optionClassName(state: "idle" | "correct" | "wrong" | "muted"): string {
  const base =
    "quiz-choice w-full rounded-xl border-2 px-4 py-3 text-left text-base transition-colors duration-150 cursor-pointer disabled:cursor-default";
  if (state === "correct") return `${base} quiz-choice--correct`;
  if (state === "wrong") return `${base} quiz-choice--wrong`;
  if (state === "muted") return `${base} quiz-choice--muted`;
  return base;
}

function ChoiceOptions({
  options,
  answerIndex,
  record,
  selectedIndex,
  onSelect,
}: {
  options: string[];
  answerIndex: number;
  record: QuizAnswerRecord | null;
  selectedIndex: number | null;
  onSelect: (optionIndex: number) => void;
}): React.ReactElement {
  // flex gap instead of space-y: antd's unlayered reset zeroes button
  // margins, which swallows space-y's sibling margins here.
  return (
    <div className="flex flex-col gap-2">
      {options.map((option, idx) => {
        let state: "idle" | "correct" | "wrong" | "muted" = "idle";
        if (record) {
          if (idx === answerIndex) state = "correct";
          else if (idx === selectedIndex) state = "wrong";
          else state = "muted";
        }
        return (
          <button
            key={idx}
            type="button"
            disabled={record != null}
            className={optionClassName(state)}
            onClick={() => onSelect(idx)}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

function SpellingHint({ question }: { question: SpellingQuestion }): React.ReactElement {
  const translation = (question.vocab.translation ?? "").trim();
  const definition = (question.vocab.definition ?? "").trim();
  return (
    <div className="space-y-1">
      <p className="m-0 flex items-center gap-2 text-lg">
        <QuizAudioButton text={question.answer} ariaLabel="播放單字發音" />
        <span className="font-medium">{translation || definition}</span>
        <PosBadge pos={question.vocab.pos} />
      </p>
      {translation && definition && (
        <p className="m-0 text-sm opacity-60">{definition}</p>
      )}
    </div>
  );
}

function ScrambleAnswer({
  question,
  record,
  onSubmit,
}: {
  question: SpellingQuestion;
  record: QuizAnswerRecord | null;
  onSubmit: (assembled: string) => void;
}): React.ReactElement {
  // Indices into scrambledLetters, in the order the user picked them.
  const [picked, setPicked] = useState<number[]>([]);
  const letters = question.scrambledLetters;
  const isFull = picked.length === letters.length;

  function pickTile(tileIndex: number): void {
    if (record || picked.includes(tileIndex)) return;
    setPicked((prev) => [...prev, tileIndex]);
  }

  function removeSlot(slotIndex: number): void {
    if (record) return;
    setPicked((prev) => prev.filter((_, i) => i !== slotIndex));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2" aria-label="你的拼法">
        {letters.map((_, slotIndex) => {
          const tileIndex = picked[slotIndex];
          const filled = tileIndex != null;
          return (
            <button
              key={slotIndex}
              type="button"
              disabled={record != null || !filled}
              onClick={() => removeSlot(slotIndex)}
              className={`quiz-tile flex h-11 w-9 items-center justify-center rounded-lg border-2 text-lg font-semibold transition-colors ${
                filled ? "quiz-tile--filled cursor-pointer" : "quiz-tile--empty"
              }`}
            >
              {filled ? letters[tileIndex] : ""}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2" aria-label="可用字母">
        {letters.map((letter, tileIndex) => {
          const used = picked.includes(tileIndex);
          return (
            <button
              key={tileIndex}
              type="button"
              disabled={record != null || used}
              onClick={() => pickTile(tileIndex)}
              className={`quiz-tile flex h-11 w-9 items-center justify-center rounded-lg border-2 text-lg font-semibold transition-colors ${
                used ? "quiz-tile--used" : "cursor-pointer"
              }`}
            >
              {letter}
            </button>
          );
        })}
      </div>

      {!record && (
        <div className="flex gap-2">
          <Button
            type="primary"
            disabled={!isFull}
            onClick={() => onSubmit(picked.map((i) => letters[i]).join(""))}
          >
            確認
          </Button>
          <Button disabled={picked.length === 0} onClick={() => setPicked([])}>
            清除
          </Button>
        </div>
      )}
    </div>
  );
}

function TypingAnswer({
  record,
  onSubmit,
}: {
  record: QuizAnswerRecord | null;
  onSubmit: (typed: string) => void;
}): React.ReactElement {
  const [typed, setTyped] = useState("");

  function submit(): void {
    if (record || !typed.trim()) return;
    onSubmit(typed.trim());
  }

  return (
    <div className="flex max-w-sm gap-2">
      <Input
        size="large"
        autoFocus
        value={typed}
        disabled={record != null}
        placeholder="輸入英文單字"
        autoCapitalize="off"
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => setTyped(e.target.value)}
        onPressEnter={submit}
      />
      {!record && (
        <Button type="primary" size="large" disabled={!typed.trim()} onClick={submit}>
          確認
        </Button>
      )}
    </div>
  );
}

function DiffLine({ label, tokens }: { label: string; tokens: DiffToken[] }): React.ReactElement {
  return (
    <p className="m-0 text-base leading-relaxed">
      <span className="mr-2 text-sm opacity-60">{label}</span>
      {tokens.map((token, idx) => (
        <span
          key={idx}
          className={
            token.ok
              ? "text-(--quiz-correct)"
              : "rounded bg-(--quiz-wrong)/10 px-0.5 text-(--quiz-wrong) font-medium"
          }
        >
          {token.text}{" "}
        </span>
      ))}
    </p>
  );
}

function DictationAnswer({
  question,
  record,
  onSubmit,
}: {
  question: DictationQuestion;
  record: QuizAnswerRecord | null;
  onSubmit: (attempt: string) => void;
}): React.ReactElement {
  const [typed, setTyped] = useState("");
  const diff = useMemo(
    () => (record ? diffDictation(question.answer, record.userAnswer) : null),
    [record, question.answer],
  );

  function submit(): void {
    if (record || !typed.trim()) return;
    onSubmit(typed.trim());
  }

  // flex gap instead of space-y: antd's unlayered reset zeroes textarea/button
  // margins, which would swallow space-y's sibling margins here.
  return (
    <div className="flex flex-col items-start gap-4">
      <div className="w-full space-y-2">
        <p className="m-0 text-base opacity-70">
          聽音檔，寫出你聽到的句子（可重複播放、拖曳進度條、調整速度）
        </p>
        <QuizAudioPlayer text={question.answer} />
      </div>

      <Input.TextArea
        className="w-full"
        autoFocus
        value={typed}
        disabled={record != null}
        placeholder="輸入你聽到的句子"
        autoSize={{ minRows: 2, maxRows: 4 }}
        autoCapitalize="off"
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => setTyped(e.target.value)}
        onPressEnter={(e) => {
          e.preventDefault();
          submit();
        }}
      />
      {!record && (
        <Button type="primary" size="large" disabled={!typed.trim()} onClick={submit}>
          確認
        </Button>
      )}

      {diff && (
        <div className="w-full space-y-2 rounded-xl border-2 border-(--card-border)/20 px-4 py-3">
          <DiffLine label="正確句子" tokens={diff.expectedTokens} />
          <DiffLine label="你的答案" tokens={diff.attemptTokens} />
          {question.translation && (
            <p className="m-0 text-sm opacity-60">{question.translation}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function QuizQuestionCard({
  question,
  index,
  total,
  onAnswered,
  onNext,
}: {
  question: QuizQuestion;
  index: number;
  total: number;
  // Fired the moment the user answers (drives records and the progress bar).
  onAnswered: (record: QuizAnswerRecord) => void;
  // Fired when the user advances past the feedback.
  onNext: () => void;
}): React.ReactElement {
  const [record, setRecord] = useState<QuizAnswerRecord | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const isLast = index + 1 === total;

  function submitRecord(next: QuizAnswerRecord): void {
    setRecord(next);
    onAnswered(next);
  }

  function answerChoice(optionIndex: number): void {
    if (record || question.kind === "spelling" || question.kind === "dictation") return;
    setSelectedIndex(optionIndex);
    submitRecord({
      question,
      userAnswer: question.options[optionIndex],
      correct: optionIndex === question.answerIndex,
    });
  }

  function answerSpelling(attempt: string): void {
    if (record || question.kind !== "spelling") return;
    submitRecord({
      question,
      userAnswer: attempt,
      correct: attempt.trim().toLowerCase() === question.answer,
    });
  }

  function answerDictation(attempt: string): void {
    if (record || question.kind !== "dictation") return;
    submitRecord({
      question,
      userAnswer: attempt,
      correct: diffDictation(question.answer, attempt).correct,
    });
  }

  let correctAnswer = "";
  if (question.kind === "spelling" || question.kind === "dictation") {
    correctAnswer = question.answer;
  } else {
    correctAnswer = question.options[question.answerIndex];
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Tag color="var(--accent)" className="m-0">{KIND_LABELS[question.kind]}</Tag>
        <span className="text-sm opacity-60">第 {index + 1} / {total} 題</span>
      </div>

      {question.kind === "cloze" && (
        <p className="m-0 text-lg leading-relaxed">{question.sentenceWithBlank}</p>
      )}
      {question.kind === "matching" && (
        <p className="m-0 flex items-center gap-3 text-2xl font-semibold">
          {question.vocab.lemma || question.vocab.text}
          <PosBadge pos={question.vocab.pos} />
        </p>
      )}
      {question.kind === "spelling" && <SpellingHint question={question} />}
      {question.kind === "comprehension" && (
        <p className="m-0 text-lg leading-relaxed">{question.question}</p>
      )}

      {question.kind === "spelling" ? (
        question.mode === "scramble" ? (
          <ScrambleAnswer question={question} record={record} onSubmit={answerSpelling} />
        ) : (
          <TypingAnswer record={record} onSubmit={answerSpelling} />
        )
      ) : question.kind === "dictation" ? (
        <DictationAnswer question={question} record={record} onSubmit={answerDictation} />
      ) : (
        <ChoiceOptions
          options={question.options}
          answerIndex={question.answerIndex}
          record={record}
          selectedIndex={selectedIndex}
          onSelect={answerChoice}
        />
      )}

      {record && (
        <div
          className={`rounded-xl px-4 py-3 text-base font-medium ${
            record.correct
              ? "bg-(--quiz-correct)/10 text-(--quiz-correct)"
              : "bg-(--quiz-wrong)/10 text-(--quiz-wrong)"
          }`}
          role="status"
        >
          {record.correct
            ? "答對了！"
            : question.kind === "dictation"
              ? "有些地方不對，看看上面的比對結果"
              : `答錯了，正確答案：${correctAnswer}`}
          {question.kind === "comprehension" && question.explanation && (
            <p className="m-0 mt-1 text-sm font-normal opacity-80">{question.explanation}</p>
          )}
        </div>
      )}

      {record && (
        <Button type="primary" size="large" onClick={onNext}>
          {isLast ? "查看成績" : "下一題"}
        </Button>
      )}
    </div>
  );
}
