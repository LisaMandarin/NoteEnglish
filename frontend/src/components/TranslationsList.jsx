import { useEffect, useRef, useState } from "react";
import { Typography, Divider, Button, Checkbox } from "antd";
import { useTranslation } from "../context/translationContext";
import SelectionMenu from "./SelectionMenu";
import { useVocabLookup } from "../hooks/useVocabLookup";
import VocabCards from "./VocabCards";
const { Text } = Typography;

export default function TranslationsList() {
  const {
    state: { sentences },
    actions: { updateSentenceVocab, removeSentenceVocab },
  } = useTranslation();

  const vocab = useVocabLookup(sentences, updateSentenceVocab);
  // const fake_sentences = [
  //     {original: "I like apples.", translation: "我喜歡蘋果。"},
  //     {original: "I like bananas.", translation: "我喜歡香蕉。"},
  //     {original: "This is a new sentence", translation: "這是一個新句子。"}
  //   ]
  // const fake_translateResponse = {
  //   "sentences": [
  //       {
  //           "id": 0,
  //           "original": "I like apples.",
  //           "translation": "我喜歡蘋果。",
  //           "vocab": [
  //               {
  //                   "text": "like",
  //                   "lemma": "like",
  //                   "pos": "VERB"
  //               },
  //               {
  //                   "text": "apples",
  //                   "lemma": "apple",
  //                   "pos": "NOUN"
  //               }
  //           ]
  //       },
  //       {
  //           "id": 1,
  //           "original": "I like bananas.",
  //           "translation": "我喜歡香蕉。",
  //           "vocab": [
  //               {
  //                   "text": "like",
  //                   "lemma": "like",
  //                   "pos": "VERB"
  //               },
  //               {
  //                   "text": "bananas",
  //                   "lemma": "banana",
  //                   "pos": "NOUN"
  //               }
  //           ]
  //       },
  //       {
  //           "id": 2,
  //           "original": "This is a new sentence.",
  //           "translation": "這是一個新句子。",
  //           "vocab": [
  //               {
  //                   "text": "new",
  //                   "lemma": "new",
  //                   "pos": "ADJ"
  //               },
  //               {
  //                   "text": "sentence",
  //                   "lemma": "sentence",
  //                   "pos": "NOUN"
  //               }
  //           ]
  //       }
  //   ]
  // }

  // const fake_vocab = {
  //     "lemma": "banana",
  //     "pos": "NOUN",
  //     "translation": "香蕉",
  //     "definition": "A long curved fruit which grows in clusters and has a soft pulpy flesh and yellow skin when ripe.",
  //     "example": "She peeled a banana and ate it for a quick snack.",
  //     "level": "A1"
  // }
  const containerRef = useRef(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [includeTranslation, setIncludeTranslation] = useState(true);
  const [includeVocab, setIncludeVocab] = useState(true);

  function clearSelection() {
    const sel = window.getSelection?.();
    if (!sel) return;

    if (sel.rangeCount > 0 && sel.removeAllRanges) {
      sel.removeAllRanges();
    }
  }

  function closeMenu() {
    setMenuOpen(false);
    vocab.reset();
    clearSelection();
  }

  function getSentenceIdxFromRange(range) {
    const containerNode = range.commonAncestorContainer;
    const el =
      containerNode.nodeType === 1
        ? containerNode
        : containerNode?.parentElement;

    const li = el?.closest("li[data-idx]");
    return li ? Number(li.dataset.idx) : null;
  }

  function getMenuPosition(range) {
    const rect = range.getBoundingClientRect();

    const MENU_W = 280;
    const MENU_H = 170;
    const GAP = 8;

    // ideal position(below the selected text) for hovering menu after selecting text
    let x = rect.left;
    let y = rect.bottom + GAP;

    // prevent right margin from exceeding the screen
    x = Math.min(x, window.innerWidth - MENU_W - GAP);
    x = Math.max(x, GAP);

    // if exceeding the screen, put the hovering menu above the selected text
    if (y + MENU_H > window.innerHeight) {
      y = rect.top - GAP - MENU_H;
    }

    y = Math.max(y, GAP);
    return { x, y };
  }

  function handleMouseUp() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return closeMenu();

    const text = sel.toString().trim();
    if (!text) return closeMenu();

    const container = containerRef.current;
    if (!container) return;

    const range = sel.getRangeAt(0);
    const commonAncestor = range.commonAncestorContainer;
    const node =
      commonAncestor.nodeType === 1
        ? commonAncestor
        : commonAncestor.parentElement;

    if (!node || !container.contains(node)) return closeMenu();

    const sentenceIdx = getSentenceIdxFromRange(range);
    if (sentenceIdx === null) return closeMenu();

    vocab.setSelectedText(text);
    vocab.setSelectedSentenceIdx(sentenceIdx);

    setMenuPos(getMenuPosition(range));
    setMenuOpen(true);
  }

  async function onLookUp() {
    const ok = await vocab.lookup();
    if (ok) {
      setMenuOpen(false);
      clearSelection();
    }
  }

  function openSummaryWindow() {
    if (!includeTranslation && !includeVocab) return;

    const payload = {
      createdAt: Date.now(),
      includeTranslation,
      includeVocab,
      rows: sentences.map((s, idx) => ({
        idx,
        original: s.original ?? "",
        translation: s.translation ?? "",
        vocab: (s.vocab ?? []).filter((v) => v?.queried === true),
      })),
    };

    localStorage.setItem("latestSummary", JSON.stringify(payload));
    const url = new URL(window.location.href);
    url.searchParams.set("view", "summary");
    window.open(url.toString(), "_blank");
  }

  useEffect(() => {
    function onDocMouseDown(e) {
      if (!menuOpen) return;

      if (!containerRef.current?.contains(e.target)) closeMenu();
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [menuOpen]);

  if (!sentences.length) {
    return <Text type="secondary">No translations yet.</Text>;
  }
  return (
    <div ref={containerRef} onMouseUp={handleMouseUp}>
      <ol className="list-decimal pl-5 space-y-3">
        {sentences.map((s, idx) => (
          <li key={idx} data-idx={idx}>
            <div>
              <Text strong>
                原文:
              </Text>{" "}
              <Text>{s.original}</Text>
            </div>
            <div className="select-none">
              <Text type="secondary" strong>翻譯:</Text> <Text type="secondary">{s.translation}</Text>
            </div>

            <VocabCards vocab={s.vocab} sentenceIdx={idx} onDelete={removeSentenceVocab} />
            <Divider className="my-4!" />
          </li>
        ))}
      </ol>
      <div className="mt-2 bg-(--bg-main) rounded-2xl p-4 shadow-lg">
        <Text strong>
          How to look up怎麼查詢:
        </Text>
        <ol className="list-decimal pl-5 mt-1">
          <li>
            <Text>Select text in the Original sentence.選英文字</Text>
          </li>
          <li>
            <Text>Wait for the menu to pop up.等選單出現</Text>
          </li>
          <li>
            <Text>Tick the boxes you want.勾選要的項目</Text>
          </li>
          <li>
            <Text>Click Look Up.按「查詢」</Text>
          </li>
        </ol>
      </div>
      <div className="flex gap-3 mt-4">
        <div className="flex items-center">
          <Checkbox
            checked={includeTranslation}
            onChange={(e) => setIncludeTranslation(e.target.checked)}
          >
            翻譯
          </Checkbox>
        </div>
        <div className="flex items-center">
          <Checkbox
            checked={includeVocab}
            onChange={(e) => setIncludeVocab(e.target.checked)}
          >
            單字筆記
          </Checkbox>
        </div>
        <div>
          <Button
            type="primary"
            disabled={!includeTranslation && !includeVocab}
            onClick={openSummaryWindow}
          >
            彙整
          </Button>
        </div>
      </div>

      <div
        onMouseUp={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <SelectionMenu
          open={menuOpen}
          x={menuPos.x}
          y={menuPos.y}
          options={vocab.options}
          setOptions={vocab.setOptions}
          onLookUp={onLookUp}
          onCancel={closeMenu}
          loading={vocab.loading}
        />
      </div>
    </div>
  );
}
