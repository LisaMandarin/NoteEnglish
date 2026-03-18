import { createContext, useContext, useMemo, useReducer } from "react";
import { supabase } from "../lib/supabase";

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

async function removeSessionArtifacts(sessionId) {
  if (!sessionId) return;

  await supabase.from("vocab_notes").delete().eq("session_id", sessionId);
  await supabase.from("session_sentences").delete().eq("session_id", sessionId);
  await supabase.from("study_sessions").delete().eq("id", sessionId);
}

async function replaceSessionArtifacts({ sessionId, userId, sentences, dispatch }) {
  const { error: deleteVocabError } = await supabase
    .from("vocab_notes")
    .delete()
    .eq("session_id", sessionId)
    .eq("user_id", userId);

  if (deleteVocabError) {
    dispatch({
      type: ACTIONS.SAVE_ERROR,
      payload: deleteVocabError.message || "Could not replace vocabulary notes.",
    });
    return false;
  }

  const { error: deleteSentenceError } = await supabase
    .from("session_sentences")
    .delete()
    .eq("session_id", sessionId)
    .eq("user_id", userId);

  if (deleteSentenceError) {
    dispatch({
      type: ACTIONS.SAVE_ERROR,
      payload: deleteSentenceError.message || "Could not replace translated sentences.",
    });
    return false;
  }

  const sentenceRows = sentences.map((sentence, index) => ({
    session_id: sessionId,
    user_id: userId,
    sentence_index: index,
    original_text: sentence.original ?? "",
    translated_text: sentence.translation ?? "",
  }));

  const { error: sentenceError } = await supabase
    .from("session_sentences")
    .insert(sentenceRows);

  if (sentenceError) {
    dispatch({
      type: ACTIONS.SAVE_ERROR,
      payload: sentenceError.message || "Could not save translated sentences.",
    });
    return false;
  }

  const vocabRows = sentences.flatMap((sentence, sentenceIndex) =>
    (sentence.vocab ?? [])
      .filter((vocab) => vocab?.queried === true && vocab?.lemma)
      .map((vocab) => ({
        session_id: sessionId,
        user_id: userId,
        sentence_index: sentenceIndex,
        selected_text: vocab.text ?? null,
        lemma: vocab.lemma,
        pos: vocab.pos ?? null,
        translation: vocab.translation ?? null,
        definition: vocab.definition ?? null,
        example: vocab.example ?? null,
        level: vocab.level ?? null,
        queried: vocab.queried ?? true,
      }))
  );

  if (vocabRows.length === 0) return true;

  const { error: vocabError } = await supabase
    .from("vocab_notes")
    .insert(vocabRows);

  if (vocabError) {
    dispatch({
      type: ACTIONS.SAVE_ERROR,
      payload: vocabError.message || "Could not save vocabulary notes.",
    });
    return false;
  }

  return true;
}

async function saveGeneratedProgress({
  userId,
  text,
  sentences,
  dispatch,
  existingSession,
}) {
  if (!userId) {
    dispatch({
      type: ACTIONS.SAVE_ERROR,
      payload: "You must be signed in to save progress.",
    });
    return false;
  }

  if (!text.trim() || !hasGeneratedTranslations(sentences)) {
    return false;
  }

  dispatch({ type: ACTIONS.SAVE_START });

  const sessionPayload = {
    user_id: userId,
    title: buildSessionTitle(text),
    source_text: text,
  };

  let sessionId = existingSession?.id ?? null;
  let sessionCreatedAt = existingSession?.createdAt ?? null;

  if (sessionId) {
    const { data: updatedSessionRow, error: updateError } = await supabase
      .from("study_sessions")
      .update({
        title: sessionPayload.title,
        source_text: sessionPayload.source_text,
      })
      .eq("id", sessionId)
      .eq("user_id", userId)
      .select("id, created_at, updated_at")
      .single();

    if (updateError || !updatedSessionRow?.id) {
      dispatch({
        type: ACTIONS.SAVE_ERROR,
        payload: updateError?.message || "Could not update the study session.",
      });
      return false;
    }

    sessionCreatedAt = updatedSessionRow.created_at ?? sessionCreatedAt;
  } else {
    const { data: sessionRow, error: sessionError } = await supabase
      .from("study_sessions")
      .insert(sessionPayload)
      .select("id, created_at, updated_at")
      .single();

    if (sessionError || !sessionRow?.id) {
      dispatch({
        type: ACTIONS.SAVE_ERROR,
        payload: sessionError?.message || "Could not create the study session.",
      });
      return false;
    }

    sessionId = sessionRow.id;
    sessionCreatedAt = sessionRow.created_at ?? null;
  }

  const didReplace = await replaceSessionArtifacts({
    sessionId,
    userId,
    sentences,
    dispatch,
  });

  if (!didReplace) {
    if (!existingSession?.id) {
      await removeSessionArtifacts(sessionId);
    }
    return false;
  }

  dispatch({
    type: ACTIONS.SAVE_SUCCESS,
    payload: {
      savedAt: Date.now(),
      session: {
        id: sessionId,
        title: sessionPayload.title,
        createdAt: sessionCreatedAt ?? new Date().toISOString(),
        sentenceCount: sentences.length,
      },
    },
  });
  return true;
}

async function fetchSessionPayload({ userId, sessionId }) {
  const { data: sessionRow, error: sessionError } = await supabase
    .from("study_sessions")
    .select("id, title, source_text, created_at, updated_at")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .single();

  if (sessionError || !sessionRow) {
    throw new Error(sessionError?.message || "Could not load the study session.");
  }

  const { data: sentenceRows, error: sentenceError } = await supabase
    .from("session_sentences")
    .select("sentence_index, original_text, translated_text")
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .order("sentence_index", { ascending: true });

  if (sentenceError) {
    throw new Error(sentenceError.message || "Could not load saved translations.");
  }

  const { data: vocabRows, error: vocabError } = await supabase
    .from("vocab_notes")
    .select(
      "sentence_index, selected_text, lemma, pos, translation, definition, example, level, queried"
    )
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .order("sentence_index", { ascending: true });

  if (vocabError) {
    throw new Error(vocabError.message || "Could not load saved vocabulary notes.");
  }

  const vocabBySentence = new Map();

  for (const vocab of vocabRows ?? []) {
    const sentenceIndex = vocab.sentence_index ?? 0;
    const bucket = vocabBySentence.get(sentenceIndex) ?? [];

    bucket.push({
      text: vocab.selected_text ?? "",
      lemma: vocab.lemma,
      pos: vocab.pos,
      translation: vocab.translation,
      definition: vocab.definition,
      example: vocab.example,
      level: vocab.level,
      queried: vocab.queried ?? true,
    });

    vocabBySentence.set(sentenceIndex, bucket);
  }

  const sentences = (sentenceRows ?? []).map((sentence) => ({
    id: sentence.sentence_index,
    original: sentence.original_text,
    translation: sentence.translated_text,
    vocab: vocabBySentence.get(sentence.sentence_index) ?? [],
  }));

  return {
    text: sessionRow.source_text ?? "",
    sentences,
    session: {
      id: sessionRow.id,
      title:
        sessionRow.title?.trim() ||
        sessionRow.source_text?.trim()?.slice(0, 80) ||
        "Untitled session",
      createdAt: sessionRow.created_at,
      sentenceCount: sentences.length,
    },
    lastSavedAt: sessionRow.updated_at ?? sessionRow.created_at ?? null,
  };
}

export function TranslationProvider({ children, user }) {
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
          userId: user?.id,
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
      if (!user?.id || !sessionId) {
        dispatch({
          type: ACTIONS.LOAD_SESSION_ERROR,
          payload: "Could not load the saved session.",
        });
        return false;
      }

      dispatch({ type: ACTIONS.LOAD_SESSION_START });

      try {
        const payload = await fetchSessionPayload({
          userId: user.id,
          sessionId,
        });

        dispatch({ type: ACTIONS.LOAD_SESSION_SUCCESS, payload });
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
  }, [state.sentences, state.text, user?.id]);

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
