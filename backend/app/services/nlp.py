import re
import spacy

_nlp = None

def _get_nlp():
    global _nlp
    if _nlp is None:
        _nlp = spacy.load("en_core_web_sm")
    return _nlp


# In-memory cache of dependency parses keyed by the raw sentence. spaCy parsing
# is deterministic, so a sentence always maps to the same result; the cache just
# avoids re-running the pipeline. Resets on restart (same as the vocab cache).
_PARSE_CACHE: dict[str, dict] = {}

# Leading question number, e.g. "120." / "12)" / "3、".
_QUESTION_NUMBER = re.compile(r"^\s*\d+\s*[.)、．。]\s*")
# Start of a multiple-choice option block, e.g. "(A)" / "（B）" / "[C]".
_OPTION_BLOCK_START = re.compile(r"[(（\[]\s*[A-Ja-j]\s*[)）\]]")


def _extract_stem(text: str) -> str:
    """Return just the question stem: drop a leading question number and anything
    from the first multiple-choice option marker onward. spaCy otherwise merges
    the options into the sentence and mis-roots the dependency tree."""
    match = _OPTION_BLOCK_START.search(text)
    if match:
        text = text[: match.start()]
    text = _QUESTION_NUMBER.sub("", text, count=1)
    return text.strip()


def parse_dependencies(sentence: str) -> dict:
    """Dependency-parse the main clause of a sentence into {tokens, reliable}.

    `tokens` is a list of {text, dep, head} dicts (shape matches the frontend
    SyntaxToken contract: token.text / token.dep_ / token.head.i, head re-indexed
    to 0-based; the ROOT token points to itself). `reliable` is False when the
    parse looks suspect — see `_looks_reliable`.

    The input may be a test-style item with a leading question number and/or
    trailing multiple-choice options (e.g. "114. <stem>. (A) ... (B) ..."). spaCy
    splits that into several sentences, so we keep the main one — preferring a
    sentence whose root is a (finite) verb, otherwise the longest."""
    sentence = sentence.strip()
    if not sentence:
        return {"tokens": [], "reliable": True}
    cached = _PARSE_CACHE.get(sentence)
    if cached is not None:
        return cached

    doc = _get_nlp()(_extract_stem(sentence) or sentence)
    sents = list(doc.sents)
    if not sents:
        result = {"tokens": [], "reliable": True}
        _PARSE_CACHE[sentence] = result
        return result

    # If the stem still splits into multiple sentences, keep the main clause:
    # prefer one whose root is a verb, otherwise the longest.
    verbal = [s for s in sents if s.root.pos_ in ("VERB", "AUX")]
    main = max(verbal or sents, key=len)

    start = main.start
    tokens = [{"text": t.text, "dep": t.dep_, "head": t.head.i - start} for t in main]
    result = {"tokens": tokens, "reliable": _looks_reliable(main)}
    _PARSE_CACHE[sentence] = result
    return result


# Write a parse result back into the cache, keyed the same way parse_dependencies
# keys it. Lets the route store a Gemini-corrected parse so the expensive fallback
# runs at most once per sentence (until restart).
def cache_parse(sentence: str, tokens: list[dict], reliable: bool) -> None:
    _PARSE_CACHE[sentence.strip()] = {"tokens": tokens, "reliable": reliable}


# Core argument roles that a single head can fill at most once.
_CORE_ARG_DEPS = frozenset({"nsubj", "nsubjpass", "dobj", "csubj"})

# Early-modern / King James English markers. spaCy's en models are trained on
# modern text and badly misparse archaic forms (e.g. "Blessed art thou … for
# flesh and blood hath not revealed it") — "art"/"hath" aren't recognised as
# verbs and "for" gets read as a preposition. Only unambiguously-archaic tokens
# are listed: words like "art" (artwork), "wilt" (plants wilt) or "ye" ("ye
# olde") also occur in modern text, so they're left out to avoid false flags.
_ARCHAIC_WORDS = frozenset({
    "thou", "thee", "thy", "thine",
    "hath", "hast", "hadst",
    "doth", "dost", "didst",
    "shalt", "canst", "wouldst", "shouldst", "couldst",
    "wast", "wert",
    "unto", "betwixt", "whence", "whither", "hither", "thither",
})


# A parse is suspect when any of:
#  1. The clause root is not a verb/auxiliary. spaCy's en models make even
#     copular "be" the root, so a non-verbal root almost always means a misparse
#     — an adjective/noun promoted over the real verb ("…, aware …, began …"
#     rooting on "aware").
#  2. The span contains archaic / King James English (see _ARCHAIC_WORDS).
#     spaCy can't parse it ("Blessed art thou … for flesh and blood hath not
#     revealed it" mis-tags the verbs and reads "for" as a preposition), and the
#     surface checks below pass anyway because the misparse hides in a quoted clause.
#  3. One head has two children with the same core argument role (e.g. two dobj).
#     That is structurally impossible in a clean parse — coordinated arguments use
#     conj, never a duplicated role — and is what spaCy produces when it mis-roots
#     a compound as a verb ("cancel culture experience …" rooting on "cancel" with
#     both "experience" and "suffering" as dobj).
#  4. A non-finite verb (infinitive / participle / gerund) is coordinated directly
#     with the clause root. Main-clause coordination is finite ("came, saw and
#     conquered"), so a non-finite conj of the root is the tell that spaCy got the
#     coordination scope wrong — it attaches a trailing "… and then to act …" or
#     "… the knowledge received" to the main verb instead of to the nearer phrase
#     it actually parallels. (A finite conj like "sang and danced" is left alone.)
# Used to flag the structure view (and trigger the Gemini fallback) so a wrong
# parse doesn't mislead the learner.
def _looks_reliable(span) -> bool:
    if span.root.pos_ not in ("VERB", "AUX"):
        return False
    # Archaic English: spaCy can't parse it, so defer to the Gemini fallback even
    # when the surface checks pass (the misparse is usually inside a quoted clause).
    if any(token.text.lower() in _ARCHAIC_WORDS for token in span):
        return False
    # Non-finite verb coordinated with the root → coordination-scope misparse.
    for child in span.root.children:
        if child.dep_ == "conj" and child.pos_ == "VERB":
            verbform = child.morph.get("VerbForm")
            if verbform and "Fin" not in verbform:
                return False
    for token in span:
        seen: set[str] = set()
        for child in token.children:
            if child.dep_ in _CORE_ARG_DEPS:
                if child.dep_ in seen:
                    return False
                seen.add(child.dep_)
    return True


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
