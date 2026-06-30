// Dependency-parse token from the backend POST /api/parse (spaCy):
// token.text / token.dep_ / token.head.i. head = index of the governing token; ROOT points to itself.
// pos = coarse-grained POS (spaCy pos_, e.g. NOUN/VERB/ADJ); lets a prep phrase's
// role (modifies a noun vs a verb) be derived from its head. Optional for back-compat.
export type SyntaxToken = { text: string; dep: string; head: number; pos?: string };

// Result of POST /api/parse. `reliable` is false when the parse looks suspect
// (clause root is not a verb/aux), so the UI can warn instead of misleading.
export type ParseResult = { tokens: SyntaxToken[]; reliable: boolean };

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
