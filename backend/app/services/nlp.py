import re
import spacy

from app.models.vocab import VocabItem

nlp = spacy.load("en_core_web_sm")

def normalize_text(text:str) -> str:
    text = text.replace("\u00a0", " ")
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    text = re.sub(r"\s+", " ", text)

    return text.strip()


def split_sentences(text: str) -> list[str]:
    text = normalize_text(text)
    if not text:
        return []
    
    doc = nlp(text)
    
    sentences = []

    for sent in doc.sents:
        sentence = sent.text.strip()
        if sentence:
            sentences.append(sentence)
    return sentences

ALLOWED_POS = {"NOUN", "VERB", "ADJ", "ADV", "ADP", "SCONJ"}

def extract_vocab(sentence: str) -> list[VocabItem]:
    doc = nlp(sentence)

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
