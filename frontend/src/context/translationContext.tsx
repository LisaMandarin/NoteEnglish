import { createContext, useContext, useMemo, useReducer } from "react";
import { apiFetch, getSessionDetail, saveSession } from "../lib/api";
import type { Sentence, Session, VocabItem } from "../types";

type AppState = {
  text: string;
  translating: boolean;
  sessionLoading: boolean;
  saving: boolean;
  error: string;
  saveError: string;
  updatedAt: number | null;
  currentSession: Session | null;
  sentences: Sentence[];
};

type Action =
  | { type: "set_text"; payload: string }
  | { type: "clear" }
  | { type: "load_session_start" }
  | { type: "load_session_success"; payload: { text: string; sentences: Sentence[]; session: Session | null; updatedAt: number | null } }
  | { type: "load_session_error"; payload?: string }
  | { type: "translate_start" }
  | { type: "translate_success"; payload: Sentence[] }
  | { type: "translate_error"; payload?: string }
  | { type: "save_start" }
  | { type: "save_success"; payload: { updatedAt: number; session: Session | null } }
  | { type: "save_error"; payload?: string }
  | { type: "update_sentence_vocab"; payload: { sentenceIdx: number; vocabItem: VocabItem } }
  | { type: "remove_sentence_vocab"; payload: { sentenceIdx: number; lemma: string; pos: string } }
  | { type: "reorder_sentence_vocab"; payload: { sentenceIdx: number; newVocab: VocabItem[] } }
  | { type: "update_current_session_title"; payload: string };

type TranslationActions = {
  translate: () => Promise<void>;
  setText: (value: string) => void;
  clear: () => void;
  loadSession: (sessionId: string) => Promise<boolean>;
  updateSentenceVocab: (sentenceIdx: number, vocabItem: VocabItem) => Promise<void>;
  removeSentenceVocab: (sentenceIdx: number, lemma: string, pos: string) => Promise<void>;
  reorderSentenceVocab: (sentenceIdx: number, newVocab: VocabItem[]) => Promise<void>;
  updateCurrentSessionTitle: (title: string) => void;
};

type TranslationContextValue = {
  state: AppState;
  actions: TranslationActions;
};

const TranslationContext = createContext<TranslationContextValue | null>(null);

const initialState: AppState = {
  text: "I like apples.  I like bananas.\nThis is a new sentence.",
  translating: false,
  sessionLoading: false,
  saving: false,
  error: "",
  saveError: "",
  updatedAt: null,
  currentSession: null,
  sentences: [],
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "set_text":
      return {
        ...state,
        text: action.payload,
        saveError: "",
        updatedAt: null,
        currentSession: state.currentSession
          ? {
              ...state.currentSession,
              title: buildSessionTitle(action.payload),
            }
          : null,
      };
    case "clear":
      return {
        ...state,
        text: "",
        error: "",
        saveError: "",
        updatedAt: null,
        currentSession: null,
        translating: false,
        sessionLoading: false,
        sentences: [],
      };
    case "load_session_start":
      return {
        ...state,
        sessionLoading: true,
        error: "",
        saveError: "",
      };
    case "load_session_success":
      return {
        ...state,
        sessionLoading: false,
        error: "",
        saveError: "",
        text: action.payload?.text ?? "",
        sentences: action.payload?.sentences ?? [],
        currentSession: action.payload?.session ?? null,
        updatedAt: action.payload?.updatedAt ?? null,
      };
    case "load_session_error":
      return {
        ...state,
        sessionLoading: false,
        error: action.payload || "Could not load the saved session.",
      };
    case "translate_start":
      return {
        ...state,
        translating: true,
        error: "",
        saveError: "",
        updatedAt: null,
        sentences: [],
      };
    case "translate_success":
      return {
        ...state,
        translating: false,
        error: "",
        saveError: "",
        sentences: action.payload ?? [],
      };
    case "translate_error":
      return {
        ...state,
        translating: false,
        error: action.payload || "Request failed",
      };
    case "save_start":
      return { ...state, saving: true, saveError: "" };
    case "save_success":
      return {
        ...state,
        saving: false,
        saveError: "",
        updatedAt: action.payload?.updatedAt ?? Date.now(),
        currentSession: action.payload?.session ?? null,
      };
    case "save_error":
      return {
        ...state,
        saving: false,
        saveError: action.payload || "Could not save progress",
      };
    case "update_sentence_vocab": {
      const { sentenceIdx, vocabItem } = action.payload;
      if (sentenceIdx == null) return state;

      const nextSentences = [...state.sentences];
      const s = nextSentences[sentenceIdx];
      if (!s) return state;

      const prevVocab = Array.isArray(s.vocab) ? s.vocab : [];

      const keyLemma = (vocabItem?.lemma ?? "").toLowerCase();
      const keyPos = (vocabItem?.pos ?? "").toLowerCase();

      const exists = prevVocab.some(
        (v) =>
          (v.lemma ?? "").toLowerCase() === keyLemma &&
          (v.pos ?? "").toLowerCase() === keyPos
      );

      const nextVocab = exists
        ? prevVocab.map((v) =>
            (v.lemma ?? "").toLowerCase() === keyLemma &&
            (v.pos ?? "").toLowerCase() === keyPos
              ? { ...v, ...vocabItem }
              : v
          )
        : [...prevVocab, vocabItem];

      nextSentences[sentenceIdx] = { ...s, vocab: nextVocab };

      return {
        ...state,
        sentences: nextSentences,
        saveError: "",
        updatedAt: null,
      };
    }

    case "remove_sentence_vocab": {
      const { sentenceIdx, lemma, pos } = action.payload;
      if (sentenceIdx == null) return state;

      const nextSentences = [...state.sentences];
      const s = nextSentences[sentenceIdx];
      if (!s) return state;

      const prevVocab = Array.isArray(s.vocab) ? s.vocab : [];
      const keyLemma = (lemma ?? "").toLowerCase();
      const keyPos = (pos ?? "").toLowerCase();

      const nextVocab = prevVocab.filter((v) => {
        const same =
          (v.lemma ?? "").toLowerCase() === keyLemma &&
          (v.pos ?? "").toLowerCase() === keyPos;
        return !same;
      });

      nextSentences[sentenceIdx] = { ...s, vocab: nextVocab };
      return {
        ...state,
        sentences: nextSentences,
        saveError: "",
        updatedAt: null,
      };
    }

    case "reorder_sentence_vocab": {
      const { sentenceIdx, newVocab } = action.payload;
      if (sentenceIdx == null) return state;
      const nextSentences = [...state.sentences];
      const s = nextSentences[sentenceIdx];
      if (!s) return state;
      nextSentences[sentenceIdx] = { ...s, vocab: newVocab };
      return { ...state, sentences: nextSentences, saveError: "", updatedAt: null };
    }

    case "update_current_session_title":
      if (!state.currentSession) return state;
      return { ...state, currentSession: { ...state.currentSession, title: action.payload } };

    default:
      return state;
  }
}

function hasGeneratedTranslations(sentences: Sentence[]): boolean {
  return (
    Array.isArray(sentences) &&
    sentences.length > 0 &&
    sentences.every(
      (sentence) =>
        typeof sentence?.translation === "string" &&
        sentence.translation.trim().length > 0
    )
  );
}

function buildSessionTitle(text: string): string {
  const firstLine = text
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) return "Untitled session";
  return firstLine.slice(0, 80);
}

async function saveGeneratedProgress({
  text,
  sentences,
  dispatch,
  existingSession,
}: {
  text: string;
  sentences: Sentence[];
  dispatch: React.Dispatch<Action>;
  existingSession: Session | null;
}): Promise<boolean> {
  if (!text.trim() || !hasGeneratedTranslations(sentences)) {
    return false;
  }

  dispatch({ type: "save_start" });
  try {
    const result = await saveSession({
      sessionId: existingSession?.id ?? null,
      text,
      sentences,
    });

    dispatch({
      type: "save_success",
      payload: {
        updatedAt: result?.saved_at ? Date.parse(result.saved_at) : Date.now(),
        session: result?.session
          ? {
              id: result.session.id,
              title: result.session.title,
              createdAt: result.session.created_at,
              updatedAt: result.session.updated_at,
              sentenceCount: sentences.length,
            }
          : null,
      },
    });
    return true;
  } catch (error: unknown) {
    dispatch({
      type: "save_error",
      payload: error instanceof Error ? error.message : "Could not save progress.",
    });
    return false;
  }
}

export function TranslationProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [state, dispatch] = useReducer(reducer, initialState);

  const actions = useMemo((): TranslationActions => {
    async function translate(): Promise<void> {
      dispatch({ type: "translate_start" });

      try {
        const data = await apiFetch("/api/translate", {
          method: "POST",
          body: JSON.stringify({ text: state.text }),
        }) as { sentences?: Sentence[] };
        const nextSentences: Sentence[] = data.sentences ?? [];

        dispatch({ type: "translate_success", payload: nextSentences });
        await saveGeneratedProgress({
          text: state.text,
          sentences: nextSentences,
          dispatch,
          existingSession: state.currentSession,
        });
      } catch (e: unknown) {
        dispatch({ type: "translate_error", payload: e instanceof Error ? e.message : undefined });
      }
    }

    function setText(value: string): void {
      dispatch({ type: "set_text", payload: value });
    }

    function clear(): void {
      dispatch({ type: "clear" });
    }

    async function loadSession(sessionId: string): Promise<boolean> {
      if (!sessionId) {
        dispatch({
          type: "load_session_error",
          payload: "Could not load the saved session.",
        });
        return false;
      }

      dispatch({ type: "load_session_start" });

      try {
        const payload = await getSessionDetail(sessionId);

        dispatch({
          type: "load_session_success",
          payload: {
            text: payload?.text ?? "",
            sentences: payload?.sentences ?? [],
            session: payload?.session
              ? {
                  id: payload.session.id,
                  title: payload.session.title,
                  createdAt: payload.session.created_at,
                  updatedAt: payload.session.updated_at,
                  sentenceCount: (payload.sentences ?? []).length,
                }
              : null,
            updatedAt: payload?.session?.updated_at
              ? Date.parse(payload.session.updated_at)
              : null,
          },
        });
        return true;
      } catch (e: unknown) {
        dispatch({ type: "load_session_error", payload: e instanceof Error ? e.message : undefined });
        return false;
      }
    }

    async function updateSentenceVocab(sentenceIdx: number, vocabItem: VocabItem): Promise<void> {
      if (sentenceIdx == null) return;

      const s = state.sentences[sentenceIdx];
      if (!s) return;

      const prevVocab = Array.isArray(s.vocab) ? s.vocab : [];
      const keyLemma = (vocabItem?.lemma ?? "").toLowerCase();
      const keyPos = (vocabItem?.pos ?? "").toLowerCase();
      const exists = prevVocab.some(
        (v) =>
          (v.lemma ?? "").toLowerCase() === keyLemma &&
          (v.pos ?? "").toLowerCase() === keyPos
      );
      const nextVocab = exists
        ? prevVocab.map((v) =>
            (v.lemma ?? "").toLowerCase() === keyLemma &&
            (v.pos ?? "").toLowerCase() === keyPos
              ? { ...v, ...vocabItem }
              : v
          )
        : [...prevVocab, vocabItem];

      const nextSentences = state.sentences.map((sentence, idx) =>
        idx === sentenceIdx ? { ...sentence, vocab: nextVocab } : sentence
      );

      dispatch({
        type: "update_sentence_vocab",
        payload: { sentenceIdx, vocabItem },
      });

      await saveGeneratedProgress({
        text: state.text,
        sentences: nextSentences,
        dispatch,
        existingSession: state.currentSession,
      });
    }

    async function removeSentenceVocab(sentenceIdx: number, lemma: string, pos: string): Promise<void> {
      const keyLemma = (lemma ?? "").toLowerCase();
      const keyPos = (pos ?? "").toLowerCase();
      const nextSentences = state.sentences.map((sentence, idx) => {
        if (idx !== sentenceIdx) return sentence;
        const prevVocab = Array.isArray(sentence.vocab) ? sentence.vocab : [];
        return {
          ...sentence,
          vocab: prevVocab.filter(
            (v) =>
              !(
                (v.lemma ?? "").toLowerCase() === keyLemma &&
                (v.pos ?? "").toLowerCase() === keyPos
              )
          ),
        };
      });

      dispatch({
        type: "remove_sentence_vocab",
        payload: { sentenceIdx, lemma, pos },
      });

      await saveGeneratedProgress({
        text: state.text,
        sentences: nextSentences,
        dispatch,
        existingSession: state.currentSession,
      });
    }

    async function reorderSentenceVocab(sentenceIdx: number, newVocab: VocabItem[]): Promise<void> {
      const nextSentences = state.sentences.map((sentence, idx) =>
        idx === sentenceIdx ? { ...sentence, vocab: newVocab } : sentence
      );

      dispatch({
        type: "reorder_sentence_vocab",
        payload: { sentenceIdx, newVocab },
      });

      await saveGeneratedProgress({
        text: state.text,
        sentences: nextSentences,
        dispatch,
        existingSession: state.currentSession,
      });
    }

    function updateCurrentSessionTitle(title: string): void {
      dispatch({ type: "update_current_session_title", payload: title });
    }

    return {
      translate,
      setText,
      clear,
      loadSession,
      updateSentenceVocab,
      removeSentenceVocab,
      reorderSentenceVocab,
      updateCurrentSessionTitle,
    };
  }, [state.currentSession, state.text, state.sentences]);

  const value = useMemo((): TranslationContextValue => ({ state, actions }), [state, actions]);

  return (
    <TranslationContext.Provider value={value}>
      {children}
    </TranslationContext.Provider>
  );
}

export function useTranslation(): TranslationContextValue {
  const ctx = useContext(TranslationContext);
  if (!ctx)
    throw new Error("useTranslation must be used within <TranslationProvider>");
  return ctx;
}
