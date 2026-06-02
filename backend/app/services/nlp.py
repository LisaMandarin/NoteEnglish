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
