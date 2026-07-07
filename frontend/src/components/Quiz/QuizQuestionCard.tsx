import { useState } from "react";
import { Button, Input, Tag } from "antd";
import type {
  ClozeQuestion,
  MatchingQuestion,
  QuizAnswerRecord,
  QuizQuestion,
  SpellingQuestion,
} from "../../types";

const KIND_LABELS: Record<QuizQuestion["kind"], string> = {
  cloze: "克漏字",
  matching: "字義配對",
  spelling: "拼字",
};

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
  question,
  record,
  selectedIndex,
  onSelect,
}: {
  question: ClozeQuestion | MatchingQuestion;
  record: QuizAnswerRecord | null;
  selectedIndex: number | null;
  onSelect: (optionIndex: number) => void;
}): React.ReactElement {
  return (
    <div className="space-y-3">
      {question.options.map((option, idx) => {
        let state: "idle" | "correct" | "wrong" | "muted" = "idle";
        if (record) {
          if (idx === question.answerIndex) state = "correct";
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

export default function QuizQuestionCard({
  question,
  index,
  total,
  onDone,
}: {
  question: QuizQuestion;
  index: number;
  total: number;
  onDone: (record: QuizAnswerRecord) => void;
}): React.ReactElement {
  const [record, setRecord] = useState<QuizAnswerRecord | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const isLast = index + 1 === total;

  function answerChoice(optionIndex: number): void {
    if (record || question.kind === "spelling") return;
    setSelectedIndex(optionIndex);
    setRecord({
      question,
      userAnswer: question.options[optionIndex],
      correct: optionIndex === question.answerIndex,
    });
  }

  function answerSpelling(attempt: string): void {
    if (record || question.kind !== "spelling") return;
    setRecord({
      question,
      userAnswer: attempt,
      correct: attempt.trim().toLowerCase() === question.answer,
    });
  }

  const correctAnswer =
    question.kind === "spelling" ? question.answer : question.options[question.answerIndex];

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

      {question.kind === "spelling" ? (
        question.mode === "scramble" ? (
          <ScrambleAnswer question={question} record={record} onSubmit={answerSpelling} />
        ) : (
          <TypingAnswer record={record} onSubmit={answerSpelling} />
        )
      ) : (
        <ChoiceOptions
          question={question}
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
          {record.correct ? "答對了！" : `答錯了，正確答案：${correctAnswer}`}
        </div>
      )}

      {record && (
        <Button type="primary" size="large" onClick={() => onDone(record)}>
          {isLast ? "查看成績" : "下一題"}
        </Button>
      )}
    </div>
  );
}
