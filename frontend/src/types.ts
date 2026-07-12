// Sentence-structure analysis from POST /api/parse. A recursive constituent tree
// (see backend app/models/parse.py). Concatenating every leaf node's `text`
// left-to-right reproduces the sentence. `pattern` is present only on clause
// nodes; `children` only on phrase/clause nodes.
export type StructureRole =
  | "ROOT" | "S" | "V" | "O" | "IO" | "DO" | "SC" | "OC"
  | "HEAD" | "DET" | "MOD" | "PREP" | "ADV" | "ADJ" | "CONJ"
  | "MARK" | "PUNCT";
export type StructureNodeType = "word" | "phrase" | "clause";
// Seven basic patterns; SVA/SVOA carry an obligatory adverbial.
export type SentencePattern = "SV" | "SVC" | "SVO" | "SVA" | "SVOO" | "SVOC" | "SVOA";
// Whole-sentence structure type derived by the backend from the tree.
export type SentenceType = "simple" | "compound" | "complex" | "compound-complex";

export type StructureNode = {
  text: string;
  role: StructureRole;
  type: StructureNodeType;
  label: string;
  pattern?: SentencePattern;
  // Backend-derived surface constituent sequence, e.g. "A+S+V+O" / "S+V+IO+DO".
  display_pattern?: string;
  children?: StructureNode[];
};

// Result of POST /api/parse. `structure` stays nullable for compatibility with
// older cached API results; `sentence_type` is null when structure is null.
export type ParseResult = {
  structure: StructureNode | null;
  sentence_type: SentenceType | null;
};

export type VocabItem = {
  text: string;
  lemma: string;
  pos: string;
  translation?: string;
  definition?: string;
  example?: string;
  example_translation?: string;
  level?: string;
  other_1?: string;
  other_2?: string;
  other_3?: string;
  other_4?: string;
  other_5?: string;
};

export type Sentence = {
  original: string;
  translation: string;
  vocab: VocabItem[];
  note?: string;
};

// A user-facing error with an optional technical detail (shown under 技術細節).
export type AppError = { message: string; technical: string };

export type Session = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  sentenceCount?: number;
  // null/undefined = not shared. Mapped from GET /sessions items' share_token.
  shareToken?: string | null;
};

// ── Sharing ───────────────────────────────────────────────────────────────────
// Raw response shapes from the share endpoints (snake_case, converted to
// camelCase at the call site, same as session loading).

export type ShareTokenResponse = { share_token: string };

// Mirrors GET /sessions/{id} so the read-only view reuses the session
// rendering path, plus who shared it and whether the viewer favorited it.
export type SharedSessionDetail = {
  text: string;
  sentences: Sentence[];
  session: {
    id: string;
    title: string;
    source_text: string;
    created_at: string;
    updated_at: string;
  };
  creator_name: string | null;
  is_favorited: boolean;
};

export type FavoriteItem = {
  session_id: string;
  title: string;
  creator_name: string | null;
  // Current token of the shared session — open via ?shared={token}.
  share_token: string;
  favorited_at: string;
};

// ── Quiz ──────────────────────────────────────────────────────────────────────
// cloze/matching/spelling/dictation are generated on the frontend from the
// current session; comprehension questions come from POST /api/quiz/generate.

export type QuizTypeKey = "cloze" | "matching" | "spelling" | "dictation" | "comprehension";
export type SpellingMode = "typing" | "scramble";

export type ClozeQuestion = {
  kind: "cloze";
  // Original sentence with the target word replaced by a blank placeholder.
  sentenceWithBlank: string;
  options: string[];
  answerIndex: number;
  vocab: VocabItem;
};

export type MatchingQuestion = {
  kind: "matching";
  // Options are Chinese translations; the prompt word comes from `vocab`.
  options: string[];
  answerIndex: number;
  vocab: VocabItem;
};

export type SpellingQuestion = {
  kind: "spelling";
  mode: SpellingMode;
  // Lowercased word the user must spell.
  answer: string;
  // Pre-shuffled letters for scramble mode (same multiset as `answer`).
  scrambledLetters: string[];
  vocab: VocabItem;
};

export type DictationQuestion = {
  kind: "dictation";
  // The original sentence the TTS audio reads out.
  answer: string;
  // Its translation, revealed only after answering.
  translation: string;
};

export type ComprehensionQuizQuestion = {
  kind: "comprehension";
  question: string;
  options: string[];
  answerIndex: number;
  // Short zh-TW explanation of the correct answer, shown after answering.
  explanation?: string;
};

export type QuizQuestion =
  | ClozeQuestion
  | MatchingQuestion
  | SpellingQuestion
  | DictationQuestion
  | ComprehensionQuizQuestion;

export type QuizAnswerRecord = {
  question: QuizQuestion;
  userAnswer: string;
  correct: boolean;
};

// Shapes exchanged with the quiz API routes.
export type VocabPoolItem = {
  lemma: string;
  pos?: string | null;
  text?: string | null;
  translation?: string | null;
  definition?: string | null;
};

// Per-word mastery from GET /api/quiz/mastery. level: 1 = 學習中, 2 = 已掌握;
// words that were never quizzed have no row.
export type WordMasteryItem = {
  lemma: string;
  pos: string;
  level: number;
  correct_count: number;
  wrong_count: number;
};

// One submitted quiz run from GET /api/quiz/runs — all results sharing an
// answered_at timestamp. session fields are null when the session was deleted.
export type QuizRunRecord = {
  session_id: string | null;
  session_title: string | null;
  quiz_types: string[];
  correct: number;
  total: number;
  answered_at: string;
};

export type QuizResultPayloadItem = {
  quiz_type: QuizTypeKey;
  lemma?: string;
  pos?: string;
  correct: boolean;
};

export type UsageHourlyItem = { hour: number; tokens: number };
export type UsageRecentHourItem = { timestamp: string; tokens: number };
export type UsageDailyItem = { date: string; tokens: number };
export type UsageMonthlyItem = { month: string; tokens: number };

export type TokenUsageData = {
  today: { total: number; hourly: UsageHourlyItem[] };
  last_12_hours: { total: number; hourly: UsageRecentHourItem[] };
  week: { total: number; daily: UsageDailyItem[] };
  months: { total: number; monthly: UsageMonthlyItem[] };
};

// Shape returned by GET /api/sessions and GET /api/sessions/:id
export type SessionRecord = {
  id: string;
  title?: string;
  source_text?: string;
  updated_at: string;
  created_at?: string;
  // Accuracy 0-100 of the LATEST quiz run per group; null/absent when that
  // group was never quizzed. word = 克漏字/字義配對/拼字, article = 理解問答/聽寫.
  word_proficiency?: number | null;
  article_proficiency?: number | null;
  // null/absent = not shared. Present on GET /api/sessions items only.
  share_token?: string | null;
};

export type SessionPage = {
  items: SessionRecord[];
  has_more: boolean;
};
