import type {
  ClozeQuestion,
  ComprehensionQuizQuestion,
  DictationQuestion,
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
  // null means no cap: one question per eligible word/sentence per selected
  // type. Comprehension questions are not counted against the cap — they cost
  // an AI call, so all of them are always included.
  questionLimit: number | null;
};

export type QuizExtras = {
  // Cross-article distractor pool (tier 3), from GET /api/quiz/vocab-pool.
  extraVocab?: VocabItem[];
  // AI questions from POST /api/quiz/generate, when "comprehension" is selected.
  comprehension?: ComprehensionQuizQuestion[];
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

// Distractors come from the user's own vocab: same POS in this article first,
// then any POS in this article, then their vocab from other sessions (tier 3).
function pickDistractors(
  entry: QuizVocabEntry,
  pool: QuizVocabEntry[],
  extraVocab: VocabItem[],
  getField: (v: VocabItem) => string,
  count: number,
): string[] {
  const answer = normalize(getField(entry.vocab));
  const answerLemma = normalize(entry.vocab.lemma);
  const seen = new Set<string>([answer]);
  const samePos: string[] = [];
  const otherPos: string[] = [];
  const crossArticle: string[] = [];

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

  for (const vocab of extraVocab) {
    if (normalize(vocab.lemma) === answerLemma) continue;
    const value = getField(vocab).trim();
    if (!value || seen.has(normalize(value))) continue;
    seen.add(normalize(value));
    crossArticle.push(value);
  }

  return [
    ...shuffle(samePos),
    ...shuffle(otherPos),
    ...shuffle(crossArticle),
  ].slice(0, count);
}

function assembleOptions(answer: string, distractors: string[]): { options: string[]; answerIndex: number } {
  const options = shuffle([answer, ...distractors]);
  return { options, answerIndex: options.indexOf(answer) };
}

function buildClozeQuestion(
  entry: QuizVocabEntry,
  pool: QuizVocabEntry[],
  extraVocab: VocabItem[],
): ClozeQuestion | null {
  const original = entry.sentence.original ?? "";
  const surface = findSurfaceForm(original, entry.vocab);
  if (!surface) return null;

  const distractors = pickDistractors(entry, pool, extraVocab, wordOf, OPTION_COUNT - 1);
  if (distractors.length === 0) return null;

  const sentenceWithBlank = original.replace(
    new RegExp(`\\b${escapeRegExp(surface)}\\b`, "i"),
    BLANK_PLACEHOLDER,
  );
  const { options, answerIndex } = assembleOptions(surface, distractors);
  return { kind: "cloze", sentenceWithBlank, options, answerIndex, vocab: entry.vocab };
}

function buildMatchingQuestion(
  entry: QuizVocabEntry,
  pool: QuizVocabEntry[],
  extraVocab: VocabItem[],
): MatchingQuestion | null {
  const translation = (entry.vocab.translation ?? "").trim();
  if (!translation) return null;

  const distractors = pickDistractors(
    entry, pool, extraVocab, (v) => v.translation ?? "", OPTION_COUNT - 1,
  );
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

// Dictation only makes sense for sentences short enough to hold in memory.
const DICTATION_MIN_WORDS = 3;
const DICTATION_MAX_WORDS = 20;

function buildDictationQuestion(sentence: Sentence): DictationQuestion | null {
  const original = (sentence.original ?? "").trim();
  if (!original) return null;
  const wordCount = original.split(/\s+/).length;
  if (wordCount < DICTATION_MIN_WORDS || wordCount > DICTATION_MAX_WORDS) return null;
  return { kind: "dictation", answer: original, translation: sentence.translation ?? "" };
}

// How many questions each frontend-generated type can produce, for the setup
// screen. Comprehension is excluded: its count comes from the AI/cache.
export function countAvailableQuestions(
  sentences: Sentence[],
): Record<Exclude<QuizTypeKey, "comprehension">, number> {
  const pool = collectQuizVocab(sentences);
  const counts = { cloze: 0, matching: 0, spelling: 0, dictation: 0 };
  for (const entry of pool) {
    if (buildClozeQuestion(entry, pool, [])) counts.cloze += 1;
    if (buildMatchingQuestion(entry, pool, [])) counts.matching += 1;
    if (buildSpellingQuestion(entry, "typing")) counts.spelling += 1;
  }
  for (const sentence of sentences) {
    if (buildDictationQuestion(sentence)) counts.dictation += 1;
  }
  return counts;
}

export function buildQuiz(
  sentences: Sentence[],
  config: QuizConfig,
  extras: QuizExtras = {},
): QuizQuestion[] {
  const pool = collectQuizVocab(sentences);
  const extraVocab = extras.extraVocab ?? [];
  const questions: QuizQuestion[] = [];

  for (const type of config.types) {
    if (type === "comprehension") continue;
    if (type === "dictation") {
      for (const sentence of sentences) {
        const question = buildDictationQuestion(sentence);
        if (question) questions.push(question);
      }
      continue;
    }
    for (const entry of pool) {
      let question: QuizQuestion | null = null;
      if (type === "cloze") question = buildClozeQuestion(entry, pool, extraVocab);
      else if (type === "matching") question = buildMatchingQuestion(entry, pool, extraVocab);
      else question = buildSpellingQuestion(entry, config.spellingMode);
      if (question) questions.push(question);
    }
  }

  const shuffled = shuffle(questions);
  const capped = config.questionLimit == null ? shuffled : shuffled.slice(0, config.questionLimit);

  const comprehension = config.types.includes("comprehension")
    ? extras.comprehension ?? []
    : [];
  return comprehension.length > 0 ? shuffle([...capped, ...comprehension]) : capped;
}

// ── Dictation word diff ───────────────────────────────────────────────────────

export type DiffToken = { text: string; ok: boolean };

export type DictationDiff = {
  correct: boolean;
  // Original sentence tokens; ok=false marks words the attempt missed/got wrong.
  expectedTokens: DiffToken[];
  // Attempt tokens; ok=false marks wrong or extra words.
  attemptTokens: DiffToken[];
};

// Case and surrounding punctuation never count against a dictation answer.
function normalizeWord(token: string): string {
  return token
    .toLowerCase()
    .replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, "")
    .replace(/[’]/g, "'");
}

export function diffDictation(expected: string, attempt: string): DictationDiff {
  const expectedRaw = expected.trim().split(/\s+/).filter(Boolean);
  const attemptRaw = attempt.trim().split(/\s+/).filter(Boolean);
  const a = expectedRaw.map(normalizeWord);
  const b = attemptRaw.map(normalizeWord);

  // Longest common subsequence over normalized words.
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j]
        ? lcs[i + 1][j + 1] + 1
        : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const expectedOk = new Array<boolean>(a.length).fill(false);
  const attemptOk = new Array<boolean>(b.length).fill(false);
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      expectedOk[i] = attemptOk[j] = true;
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }

  // Punctuation-only tokens normalize to "" and never count as mistakes.
  const expectedTokens = expectedRaw.map((text, idx) => ({
    text,
    ok: expectedOk[idx] || a[idx] === "",
  }));
  const attemptTokens = attemptRaw.map((text, idx) => ({
    text,
    ok: attemptOk[idx] || b[idx] === "",
  }));
  return {
    correct: expectedTokens.every((t) => t.ok) && attemptTokens.every((t) => t.ok),
    expectedTokens,
    attemptTokens,
  };
}
