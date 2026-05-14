import re
import spacy

from app.models.vocab import VocabItem

_nlp = None

def _get_nlp():
    global _nlp
    if _nlp is None:
        _nlp = spacy.load("en_core_web_sm")
    return _nlp

# Clean up whitespace and normalize newlines.
def normalize_text(text:str) -> str:
    """Collapse non-breaking spaces, Windows line endings, and runs of whitespace into single spaces."""
    text = text.replace("\u00a0", " ")
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    text = re.sub(r"\s+", " ", text)

    return text.strip()


# Split a block of text into sentences using spaCy.
def split_sentences(text: str) -> list[str]:
    """Return a list of non-empty sentences from `text` using spaCy's sentence boundary detection."""
    text = normalize_text(text)
    if not text:
        return []

    doc = _get_nlp()(text)
    
    sentences = []

    for sent in doc.sents:
        sentence = sent.text.strip()
        if sentence:
            sentences.append(sentence)
    return sentences

# Parts of speech we consider for vocab extraction.
ALLOWED_POS = {"NOUN", "VERB", "ADJ", "ADV", "ADP", "SCONJ"}

# Extract unique vocab items from a sentence, filtered by allowed POS.
def extract_vocab(sentence: str) -> list[VocabItem]:
    """Return unique vocab items from `sentence`, keeping only content words (nouns, verbs, adjectives, adverbs, prepositions, subordinating conjunctions) and skipping stop words and non-alpha tokens."""
    doc = _get_nlp()(sentence)

    seen = set()
    vocab: list[VocabItem] = []

    for token in doc:
        # ignore punctuations, digits, space
        if not token.is_alpha:
            continue
        # ignore a, the, in, to...
        if token.is_stop:
            continue
        if token.pos_ not in ALLOWED_POS:
            continue

        lemma = token.lemma_.lower().strip()
        pos = token.pos_

        if not lemma:
            continue

        key = f"{lemma}|{pos}"
        if key in seen:
            continue

        seen.add(key)

        vocab.append(
            VocabItem(
                text=token.text,
                lemma=lemma,
                pos=pos
            )
        )
    return vocab
