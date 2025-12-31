import { useEffect, useRef, useState } from "react";
import { Typography, Divider } from "antd";
import { useTranslation } from "../context/translationContext";
import SelectionMenu from "./SelectionMenu";
import { useVocabLookup } from "../hooks/useVocabLookup";
const { Text } = Typography;

export default function TranslationsList() {
  const {
    state: { sentences },
  } = useTranslation();
  const containerRef = useRef(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  
  const vocab = useVocabLookup(sentences);

  function closeMenu() {
    setMenuOpen(false);
    vocab.reset();
  }

  function getSentenceIdxFromSelection(sel) {
    const anchorEl = 
      sel.anchorNode?.nodeType === 1 
        ? sel.anchorNode 
        : sel.anchorNode?.parentElement;

    const li = anchorEl?.closest("li[data-idx]");
    return li ? Number(li.dataset.idx) : null;
  }

  function getMenuPosition(range) {
    const rect = range.getBoundingClientRect();
    return {
      x: Math.min(rect.left, window.innerWidth -280),
      y: rect.bottom + 8
    };
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

    vocab.setSelectedText(text);
    vocab.setSelectedSentenceIdx(getSentenceIdxFromSelection(sel));
    setMenuPos(getMenuPosition(range));
    setMenuOpen(true);
  }

  async function onLookUp() {
    const ok = await vocab.lookup();
    if (ok) setMenuOpen(false);
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
              <Text type="secondary" strong>
                Original:
              </Text>{" "}
              <Text type="secondary">{s.original}</Text>
            </div>
            <div className="select-none">
              <Text strong>Translation:</Text> <Text>{s.translation}</Text>
            </div>
            <Divider />
          </li>
        ))}
      </ol>

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
  );
}
