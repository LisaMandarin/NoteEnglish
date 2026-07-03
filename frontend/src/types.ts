// Sentence-structure analysis from POST /api/parse. A recursive constituent tree
// (see backend app/models/parse.py). Concatenating every leaf node's `text`
// left-to-right reproduces the sentence. `pattern` is present only on clause
// nodes; `children` only on phrase/clause nodes.
export type StructureRole =
  | "ROOT" | "S" | "V" | "O" | "IO" | "DO" | "SC" | "OC"
  | "HEAD" | "DET" | "MOD" | "PREP" | "ADV" | "ADJ" | "CONJ"
  | "MARK" | "PUNCT";
export type StructureNodeType = "word" | "phrase" | "clause";
export type SentencePattern = "SV" | "SVC" | "SVO" | "SVOO" | "SVOC";

export type StructureNode = {
  text: string;
  role: StructureRole;
  type: StructureNodeType;
  label: string;
  pattern?: SentencePattern;
  children?: StructureNode[];
};

// Result of POST /api/parse. `structure` stays nullable for compatibility with
// older cached API results.
export type ParseResult = { structure: StructureNode | null };

export type VocabItem = {
  text: string;
  lemma: string;
  pos: string;
  translation?: string;
  definition?: string;
  example?: string;
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
};

export type SessionPage = {
  items: SessionRecord[];
  has_more: boolean;
};
