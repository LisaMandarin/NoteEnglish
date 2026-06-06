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
