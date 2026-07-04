import re
import spacy

# Invisible format characters (BOM/zero-width spaces/joiners, soft hyphen) that
# ride along when text is copied from PDFs. They are not whitespace, so \s
# does not remove them, yet Gemini never reproduces them — left in, they make
# the verbatim-reconstruction check fail on otherwise perfect analyses.
_INVISIBLE_CHARS = re.compile(r"[\u200b-\u200f\u2060\ufeff\u00ad]")


def strip_invisible(text: str) -> str:
    """Remove zero-width/format characters that carry no visible content."""
    return _INVISIBLE_CHARS.sub("", text)


_nlp = None

def _get_nlp():
    global _nlp
    if _nlp is None:
        _nlp = spacy.load("en_core_web_sm")
    return _nlp


def analyze_tokens(text: str) -> list[dict[str, str | bool | int]]:
    """Return token attributes needed for deterministic tree fallbacks."""
    return [
        {
            "index": token.i,
            "head_index": token.head.i,
            "start": token.idx,
            "end": token.idx + len(token.text),
            "text": token.text,
            "lower": token.lower_,
            "pos": token.pos_,
            "dep": token.dep_,
            "is_root": token.dep_ == "ROOT",
            "is_finite": token.morph.get("VerbForm") == ["Fin"] or any(
                child.dep_ in {"aux", "auxpass"}
                and (
                    child.morph.get("VerbForm") == ["Fin"]
                    or child.tag_ == "MD"
                )
                for child in token.children
            ),
            "has_subject": any(
                child.dep_ in {"nsubj", "nsubjpass", "csubj", "expl"}
                for child in token.children
            ),
            "has_marker": any(child.dep_ == "mark" for child in token.children),
        }
        for token in _get_nlp()(text)
        if not token.is_space
    ]


def _span_is_complete_sentence(span) -> bool:
    """Return whether a spaCy sentence span contains an independent clause."""
    root = span.root
    if root.pos_ not in {"VERB", "AUX"}:
        return False

    # A root introduced by a subordinating marker (because/if/although/etc.) is
    # a dependent clause, even when it contains both a subject and a verb.
    if any(token.dep_ == "mark" and token.head == root for token in span):
        return False

    has_subject = any(
        token.head == root and token.dep_ in {"nsubj", "nsubjpass", "csubj", "expl"}
        for token in span
    )
    has_finite_verb = root.morph.get("VerbForm") == ["Fin"] or any(
        token.head == root
        and token.dep_ in {"aux", "auxpass"}
        and (token.morph.get("VerbForm") == ["Fin"] or token.tag_ == "MD")
        for token in span
    )
    if has_subject and has_finite_verb:
        return True

    # Inverted copular sentences front the predicate and leave the root
    # subjectless ("Most inspiring is that their faithfulness depends ...").
    # spaCy parses the fronted phrase as acomp/attr and the true subject
    # clause as a ccomp carrying its own subject.
    if has_finite_verb and root.pos_ == "AUX":
        has_predicative = any(
            token.head == root and token.dep_ in {"acomp", "attr"} for token in span
        )
        has_clausal_subject = any(
            token.head == root
            and token.dep_ == "ccomp"
            and any(
                child.dep_ in {"nsubj", "nsubjpass", "csubj", "expl"}
                for child in token.children
            )
            for token in span
        )
        if has_predicative and has_clausal_subject:
            return True

    # Imperatives use a bare root verb and normally omit their subject. Exclude
    # infinitives ("To learn English") and modal fragments ("Can swim").
    if root.pos_ == "VERB" and root.tag_ == "VB" and not has_subject:
        has_infinitive_marker = any(
            token.head == root and token.lower_ == "to" for token in span
        )
        has_modal = any(token.head == root and token.tag_ == "MD" for token in span)
        return not has_infinitive_marker and not has_modal

    return False


def is_complete_sentence(text: str) -> bool:
    """Return True only when `text` is one complete English sentence.

    Punctuation is intentionally not required: "She reads." and "She reads"
    are both complete clauses, while a punctuated phrase is still incomplete.
    """
    normalized = text.strip()
    if not normalized or not re.search(r"[a-zA-Z]", normalized):
        return False

    spans = [
        span
        for span in _get_nlp()(normalized).sents
        if re.search(r"[a-zA-Z]", span.text)
    ]
    return len(spans) == 1 and _span_is_complete_sentence(spans[0])


# Matches a single multiple-choice option marker, e.g. "(A)", "（B）", "C.", "D)".
# Covers bracketed forms anywhere, and letter+delimiter forms at a word boundary.
_OPTION_MARKER = re.compile(
    r"[(（\[]\s*[A-Ja-j]\s*[)）\]]"
    r"|(?:^|\s)[A-Ja-j][.．。、)](?=\s|$)"
)

# Matches an option marker sitting at the very start of a line (e.g. "A.", "(B)").
_OPTION_LINE_START = re.compile(r"^[(（\[]?\s*[A-Ja-j]\s*[)）\].．。、]")


# Split one prose line into sentences, keeping leading numeric labels attached.
def _split_line(nlp, line: str, pending: str = "") -> tuple[list[str], str]:
    """Run spaCy sentence detection on a single line. A fragment with no letters
    (e.g. a question number like "114.") is held and prepended to the next real
    sentence. The remaining fragment is returned so it can cross a line break."""
    out: list[str] = []
    for sent in nlp(line).sents:
        sentence = sent.text.strip()
        if not sentence:
            continue
        if re.search(r"[a-zA-Z]", sentence):
            out.append(f"{pending} {sentence}".strip() if pending else sentence)
            pending = ""
        else:
            # Numeric / punctuation-only fragment: carry it to the next sentence.
            pending = f"{pending} {sentence}".strip()
    return out, pending


# Split a block of text into sentences using spaCy.
def split_sentences(text: str) -> list[str]:
    """Return a list of non-empty sentences from `text` using spaCy's sentence
    boundary detection.

    Preserves paragraph structure by treating each newline-delimited line as a
    separate unit before running spaCy, so quoted paragraphs are not merged.
    Multiple-choice option rows ("(A) ... (B) ...") are kept intact and merged
    into the preceding question stem so the whole question stays one unit.
    """
    if not text:
        return []

    # Normalize non-breaking spaces and Windows line endings, but keep newlines.
    text = strip_invisible(text)
    text = text.replace("\u00a0", " ")
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    # Collect individual lines (each quoted paragraph is typically one line).
    lines = [re.sub(r" +", " ", ln.strip()) for ln in text.splitlines() if ln.strip()]

    nlp = _get_nlp()
    sentences: list[str] = []
    pending = ""

    for line in lines:
        option_markers = list(_OPTION_MARKER.finditer(line))

        if _OPTION_LINE_START.match(line):
            # Attach the option row to the question stem above it (one card),
            # unless a question label is waiting from the preceding line.
            if pending:
                sentences.append(f"{pending}\n{line}")
                pending = ""
            elif sentences:
                sentences[-1] = f"{sentences[-1]}\n{line}"
            else:
                sentences.append(line)
            continue

        if len(option_markers) >= 2:
            # A question stem followed by packed inline options is a new item,
            # not an option-only row belonging to the preceding question.
            first_marker = option_markers[0].start()
            stem = line[:first_marker].rstrip()
            options = line[first_marker:].strip()
            stem_sentences, pending = _split_line(nlp, stem, pending)
            sentences.extend(stem_sentences)
            if pending and not re.search(r"\w", pending):
                pending = ""

            if pending:
                sentences.append(f"{pending}\n{options}")
                pending = ""
            elif sentences:
                sentences[-1] = f"{sentences[-1]}\n{options}"
            else:
                sentences.append(options)
            continue

        line_sentences, pending = _split_line(nlp, line, pending)
        sentences.extend(line_sentences)
        if pending and not re.search(r"\w", pending):
            pending = ""

    # Preserve a meaningful trailing number/label while continuing to discard
    # punctuation-only fragments such as a bare ellipsis.
    if pending and re.search(r"\w", pending):
        sentences.append(pending)

    return sentences
