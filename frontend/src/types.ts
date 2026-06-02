export type VocabItem = {
  text: string;
  lemma: string;
  pos: string;
  translation?: string;
  definition?: string;
  example?: string;
  level?: string;
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

// Shape returned by GET /api/sessions and GET /api/sessions/:id
export type SessionRecord = {
  id: string;
  title?: string;
  source_text?: string;
  updated_at: string;
  created_at?: string;
};
