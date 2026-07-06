import type {
  ClozeQuestion,
  MatchingQuestion,
  QuizQuestion,
  QuizTypeKey,
  Sentence,
  SpellingMode,
  SpellingQuestion,
  VocabItem,
} from "../types";

export type QuizConfig = {
  types: QuizTypeKey[];
  spellingMode: SpellingMode;
  // null means no cap: one question per eligible word per selected type.
  questionLimit: number | null;
};

export const BLANK_PLACEHOLDER = "______";

const OPTION_COUNT = 4;

type QuizVocabEntry = {
  vocab: VocabItem;
  sentence: Sentence;
};

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function normalize(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function wordOf(v: VocabItem): string {
  return (v.text ?? "").trim() || (v.lemma ?? "").trim();
}

// Unique vocab across the article, keyed by (lemma, pos) like the rest of the
// app, each paired with the sentence it was added to.
export function collectQuizVocab(sentences: Sentence[]): QuizVocabEntry[] {
  const seen = new Set<string>();
  const result: QuizVocabEntry[] = [];
  for (const sentence of sentences) {
    for (const vocab of sentence.vocab ?? []) {
      if (!wordOf(vocab)) continue;
      const key = `${normalize(vocab.lemma) || normalize(vocab.text)}|${normalize(vocab.pos)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ vocab, sentence });
    }
  }
  return result;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Find the vocab word (selected text first, lemma as fallback) in its sentence
// as a whole word, so cloze can blank the exact surface form.
function findSurfaceForm(sentence: string, vocab: VocabItem): string | null {
  for (const candidate of [vocab.text, vocab.lemma]) {
    const word = (candidate ?? "").trim();
    if (!word) continue;
    const match = sentence.match(new RegExp(`\\b${escapeRegExp(word)}\\b`, "i"));
    if (match) return match[0];
  }
  return null;
}

// Distractors come from the user's own vocab in this article: same POS first,
// then any POS. (Pulling from other sessions is planned for phase 2.)
function pickDistractors(
  entry: QuizVocabEntry,
  pool: QuizVocabEntry[],
  getField: (v: VocabItem) => string,
  count: number,
): string[] {
  const answer = normalize(getField(entry.vocab));
  const seen = new Set<string>([answer]);
  const samePos: string[] = [];
  const otherPos: string[] = [];

  for (const candidate of pool) {
    if (candidate === entry) continue;
    const value = getField(candidate.vocab).trim();
    if (!value || seen.has(normalize(value))) continue;
    seen.add(normalize(value));
    if (normalize(candidate.vocab.pos) === normalize(entry.vocab.pos)) {
      samePos.push(value);
    } else {
      otherPos.push(value);
    }
  }

  return [...shuffle(samePos), ...shuffle(otherPos)].slice(0, count);
}

function assembleOptions(answer: string, distractors: string[]): { options: string[]; answerIndex: number } {
  const options = shuffle([answer, ...distractors]);
  return { options, answerIndex: options.indexOf(answer) };
}

function buildClozeQuestion(entry: QuizVocabEntry, pool: QuizVocabEntry[]): ClozeQuestion | null {
  const original = entry.sentence.original ?? "";
  const surface = findSurfaceForm(original, entry.vocab);
  if (!surface) return null;

  const distractors = pickDistractors(entry, pool, wordOf, OPTION_COUNT - 1);
  if (distractors.length === 0) return null;

  const sentenceWithBlank = original.replace(
    new RegExp(`\\b${escapeRegExp(surface)}\\b`, "i"),
    BLANK_PLACEHOLDER,
  );
  const { options, answerIndex } = assembleOptions(surface, distractors);
  return { kind: "cloze", sentenceWithBlank, options, answerIndex, vocab: entry.vocab };
}

function buildMatchingQuestion(entry: QuizVocabEntry, pool: QuizVocabEntry[]): MatchingQuestion | null {
  const translation = (entry.vocab.translation ?? "").trim();
  if (!translation) return null;

  const distractors = pickDistractors(entry, pool, (v) => v.translation ?? "", OPTION_COUNT - 1);
  if (distractors.length === 0) return null;

  const { options, answerIndex } = assembleOptions(translation, distractors);
  return { kind: "matching", options, answerIndex, vocab: entry.vocab };
}

// Spelling only makes sense for single alphabetic words (no phrases).
function spellingAnswer(vocab: VocabItem): string | null {
  const word = ((vocab.lemma ?? "").trim() || (vocab.text ?? "").trim()).toLowerCase();
  return /^[a-z]{3,}$/.test(word) ? word : null;
}

function scrambleLetters(word: string): string[] {
  const letters = word.split("");
  for (let attempt = 0; attempt < 10; attempt++) {
    const shuffled = shuffle(letters);
    if (shuffled.join("") !== word) return shuffled;
  }
  return shuffle(letters);
}

function buildSpellingQuestion(entry: QuizVocabEntry, mode: SpellingMode): SpellingQuestion | null {
  const answer = spellingAnswer(entry.vocab);
  if (!answer) return null;
  const hasHint = Boolean((entry.vocab.translation ?? "").trim() || (entry.vocab.definition ?? "").trim());
  if (!hasHint) return null;
  return {
    kind: "spelling",
    mode,
    answer,
    scrambledLetters: mode === "scramble" ? scrambleLetters(answer) : [],
    vocab: entry.vocab,
  };
}

// How many questions each type can produce, for the setup screen.
export function countAvailableQuestions(sentences: Sentence[]): Record<QuizTypeKey, number> {
  const pool = collectQuizVocab(sentences);
  const counts: Record<QuizTypeKey, number> = { cloze: 0, matching: 0, spelling: 0 };
  for (const entry of pool) {
    if (buildClozeQuestion(entry, pool)) counts.cloze += 1;
    if (buildMatchingQuestion(entry, pool)) counts.matching += 1;
    if (buildSpellingQuestion(entry, "typing")) counts.spelling += 1;
  }
  return counts;
}

export function buildQuiz(sentences: Sentence[], config: QuizConfig): QuizQuestion[] {
  const pool = collectQuizVocab(sentences);
  const questions: QuizQuestion[] = [];

  for (const type of config.types) {
    for (const entry of pool) {
      let question: QuizQuestion | null = null;
      if (type === "cloze") question = buildClozeQuestion(entry, pool);
      else if (type === "matching") question = buildMatchingQuestion(entry, pool);
      else question = buildSpellingQuestion(entry, config.spellingMode);
      if (question) questions.push(question);
    }
  }

  const shuffled = shuffle(questions);
  return config.questionLimit == null ? shuffled : shuffled.slice(0, config.questionLimit);
}
