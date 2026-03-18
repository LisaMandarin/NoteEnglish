import { createContext, useContext, useMemo, useReducer } from "react";
import { getSessionDetail, saveSession } from "../lib/api";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";

const TranslationContext = createContext(null);

const initialState = {
  text: "I like apples.  I like bananas.\nThis is a new sentence.",
  translating: false,
  sessionLoading: false,
  saving: false,
  error: "",
  saveError: "",
  lastSavedAt: null,
  currentSession: null,
  sentences: [],
};

const ACTIONS = {
  SET_TEXT: "set_text",
  CLEAR: "clear",
  LOAD_SESSION_START: "load_session_start",
  LOAD_SESSION_SUCCESS: "load_session_success",
  LOAD_SESSION_ERROR: "load_session_error",
  TRANSLATE_START: "translate_start",
  TRANSLATE_SUCCESS: "translate_success",
  TRANLSATE_ERROR: "translate_error",
  SAVE_START: "save_start",
  SAVE_SUCCESS: "save_success",
  SAVE_ERROR: "save_error",
  UPDATE_SENTENCE_VOCAB: "update_sentence_vocab",
  REMOVE_SENTENCE_VOCAB: "remove_sentence_vocab",
};
function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.SET_TEXT:
      return {
        ...state,
        text: action.payload,
        saveError: "",
        lastSavedAt: null,
        currentSession: state.currentSession
          ? {
              ...state.currentSession,
              title: buildSessionTitle(action.payload),
            }
          : null,
      };
    case ACTIONS.CLEAR:
      return {
        ...state,
        text: "",
        error: "",
        saveError: "",
        lastSavedAt: null,
        currentSession: null,
        translating: false,
        sessionLoading: false,
        sentences: [],
      };
    case ACTIONS.LOAD_SESSION_START:
      return {
        ...state,
        sessionLoading: true,
        error: "",
        saveError: "",
      };
    case ACTIONS.LOAD_SESSION_SUCCESS:
      return {
        ...state,
        sessionLoading: false,
        error: "",
        saveError: "",
        text: action.payload?.text ?? "",
        sentences: action.payload?.sentences ?? [],
        currentSession: action.payload?.session ?? null,
        lastSavedAt: action.payload?.lastSavedAt ?? null,
      };
    case ACTIONS.LOAD_SESSION_ERROR:
      return {
        ...state,
        sessionLoading: false,
        error: action.payload || "Could not load the saved session.",
      };
    case ACTIONS.TRANSLATE_START:
      return {
        ...state,
        translating: true,
        error: "",
        saveError: "",
        lastSavedAt: null,
        sentences: [],
      };
    case ACTIONS.TRANSLATE_SUCCESS:
      return {
        ...state,
        translating: false,
        error: "",
        saveError: "",
        sentences: action.payload ?? [],
      };
    case ACTIONS.TRANLSATE_ERROR:
      return {
        ...state,
        translating: false,
        error: action.payload || "Request failed",
      };
    case ACTIONS.SAVE_START:
      return { ...state, saving: true, saveError: "" };
    case ACTIONS.SAVE_SUCCESS:
      return {
        ...state,
        saving: false,
        saveError: "",
        lastSavedAt: action.payload?.savedAt ?? Date.now(),
        currentSession: action.payload?.session ?? null,
      };
    case ACTIONS.SAVE_ERROR:
      return {
        ...state,
        saving: false,
        saveError: action.payload || "Could not save progress",
      };
    case ACTIONS.UPDATE_SENTENCE_VOCAB: {
      const { sentenceIdx, vocabItem } = action.payload || {};
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
        lastSavedAt: null,
      };
    }

    case ACTIONS.REMOVE_SENTENCE_VOCAB: {
      const { sentenceIdx, lemma, pos} = action.payload || {};
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

      nextSentences[sentenceIdx] = {...s, vocab: nextVocab};
      return {
        ...state,
        sentences: nextSentences,
        saveError: "",
        lastSavedAt: null,
      };
    }

    default:
      return state;
  }
}

function hasGeneratedTranslations(sentences) {
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

function buildSessionTitle(text) {
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
}) {
  if (!text.trim() || !hasGeneratedTranslations(sentences)) {
    return false;
  }

  dispatch({ type: ACTIONS.SAVE_START });
  try {
    const result = await saveSession({
      sessionId: existingSession?.id ?? null,
      text,
      sentences,
    });

    dispatch({
      type: ACTIONS.SAVE_SUCCESS,
      payload: {
        savedAt: result?.saved_at ? Date.parse(result.saved_at) : Date.now(),
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
  } catch (error) {
    dispatch({
      type: ACTIONS.SAVE_ERROR,
      payload: error?.message || "Could not save progress.",
    });
    return false;
  }
}

export function TranslationProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const actions = useMemo(() => {
    async function translate() {
      dispatch({ type: ACTIONS.TRANSLATE_START });

      try {
        const response = await fetch(`${API_BASE}/api/translate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: state.text }),
        });

        if (!response.ok) {
          const msg = await response.text();
          throw new Error(`HTTP ${response.status} - ${msg}`);
        }

        const data = await response.json();
        const nextSentences = data.sentences ?? [];

        dispatch({ type: ACTIONS.TRANSLATE_SUCCESS, payload: nextSentences });
        await saveGeneratedProgress({
          text: state.text,
          sentences: nextSentences,
          dispatch,
          existingSession: state.currentSession,
        });
      } catch (e) {
        dispatch({ type: ACTIONS.TRANLSATE_ERROR, payload: e?.message });
      }
    }

    function setText(value) {
      dispatch({ type: ACTIONS.SET_TEXT, payload: value });
    }

    function clear() {
      dispatch({ type: ACTIONS.CLEAR });
    }

    async function loadSession(sessionId) {
      if (!sessionId) {
        dispatch({
          type: ACTIONS.LOAD_SESSION_ERROR,
          payload: "Could not load the saved session.",
        });
        return false;
      }

      dispatch({ type: ACTIONS.LOAD_SESSION_START });

      try {
        const payload = await getSessionDetail(sessionId);

        dispatch({
          type: ACTIONS.LOAD_SESSION_SUCCESS,
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
            lastSavedAt: payload?.last_saved_at
              ? Date.parse(payload.last_saved_at)
              : null,
          },
        });
        return true;
      } catch (e) {
        dispatch({ type: ACTIONS.LOAD_SESSION_ERROR, payload: e?.message });
        return false;
      }
    }

    function updateSentenceVocab(sentenceIdx, vocabItem) {
      dispatch({
        type: ACTIONS.UPDATE_SENTENCE_VOCAB,
        payload: { sentenceIdx, vocabItem },
      });
    }

    function removeSentenceVocab(sentenceIdx, lemma, pos) {
      dispatch({
        type: ACTIONS.REMOVE_SENTENCE_VOCAB,
        payload: {sentenceIdx, lemma, pos},
      });
    }

    return {
      translate,
      setText,
      clear,
      loadSession,
      updateSentenceVocab,
      removeSentenceVocab,
    };
  }, [state.currentSession, state.text]);

  const value = useMemo(() => ({ state, actions }), [state, actions]);

  return (
    <TranslationContext.Provider value={value}>
      {children}
    </TranslationContext.Provider>
  );
}

export function useTranslation() {
  const ctx = useContext(TranslationContext);
  if (!ctx)
    throw new Error("useTranslation must be used within <TranslationProvider>");
  return ctx;
}
