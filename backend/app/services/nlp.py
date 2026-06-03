import re
import spacy

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
    """Return a list of non-empty sentences from `text` using spaCy's sentence boundary detection.

    Preserves paragraph structure by treating each newline-delimited line as a
    separate unit before running spaCy, so quoted paragraphs are not merged.
    Filters out trivial tokens (pure punctuation / ellipsis) that carry no text.
    """
    if not text:
        return []

    # Normalize non-breaking spaces and Windows line endings, but keep newlines.
    text = text.replace("\u00a0", " ")
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    # Collect individual lines (each quoted paragraph is typically one line).
    lines = [re.sub(r" +", " ", ln.strip()) for ln in text.splitlines() if ln.strip()]

    nlp = _get_nlp()
    sentences = []

    for line in lines:
        doc = nlp(line)
        for sent in doc.sents:
            sentence = sent.text.strip()
            # Skip tokens that contain no word characters (e.g. bare "\u2026" or "...").
            if sentence and re.search(r"\w", sentence):
                sentences.append(sentence)

    return sentences
