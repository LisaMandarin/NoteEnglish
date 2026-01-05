import { createContext, useContext, useMemo, useReducer } from "react";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";

const TranslationContext = createContext(null);

const initialState = {
  text: "I like apples.  I like bananas.\nThis is a new sentence.",
  loading: false,
  error: "",
  sentences: [],
};

const ACTIONS = {
  SET_TEXT: "set_text",
  CLEAR: "clear",
  TRANSLATE_START: "translate_start",
  TRANSLATE_SUCCESS: "translate_success",
  TRANLSATE_ERROR: "translate_error",
  UPDATE_SENTENCE_VOCAB: "update_sentence_vocab",
  REMOVE_SENTENCE_VOCAB: "remove_sentence_vocab",
};
function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.SET_TEXT:
      return { ...state, text: action.payload };
    case ACTIONS.CLEAR:
      return { ...state, text: "", error: "", sentences: [] };
    case ACTIONS.TRANSLATE_START:
      return { ...state, loading: true, error: "", sentences: [] };
    case ACTIONS.TRANSLATE_SUCCESS:
      return { ...state, loading: false, sentences: action.payload ?? [] };
    case ACTIONS.TRANLSATE_ERROR:
      return {
        ...state,
        loading: false,
        error: action.payload || "Request failed",
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

      return { ...state, sentences: nextSentences };
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
      return {...state, sentences: nextSentences}
    }

    default:
      return state;
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
        dispatch({ type: ACTIONS.TRANSLATE_SUCCESS, payload: data.sentences });
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

    return { translate, setText, clear, updateSentenceVocab, removeSentenceVocab };
  }, [state.text]);

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
