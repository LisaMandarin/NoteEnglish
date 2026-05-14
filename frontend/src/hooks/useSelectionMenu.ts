import { useEffect, useState } from "react";

function clearSelection() {
  const sel = window.getSelection?.();
  if (!sel) return;
  if (sel.rangeCount > 0 && sel.removeAllRanges) sel.removeAllRanges();
}

function getSentenceIdxFromRange(range) {
  const containerNode = range.commonAncestorContainer;
  const el =
    containerNode.nodeType === 1 ? containerNode : containerNode?.parentElement;
  const li = el?.closest("li[data-idx]");
  return li ? Number(li.dataset.idx) : null;
}

function getMenuPosition(range) {
  const rect = range.getBoundingClientRect();
  const MENU_W = 280;
  const MENU_H = 170;
  const GAP = 8;

  let x = rect.left;
  let y = rect.bottom + GAP;

  x = Math.min(x, window.innerWidth - MENU_W - GAP);
  x = Math.max(x, GAP);

  if (y + MENU_H > window.innerHeight) {
    y = rect.top - GAP - MENU_H;
  }

  y = Math.max(y, GAP);
  return { x, y };
}

export function useSelectionMenu({ containerRef, vocab }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });

  function closeMenu() {
    setMenuOpen(false);
    vocab.reset();
    clearSelection();
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

  useEffect(() => {
    function onDocMouseDown(e) {
      if (!menuOpen) return;
      if (!containerRef.current?.contains(e.target)) closeMenu();
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [menuOpen]);

  return { menuOpen, menuPos, handleMouseUp, closeMenu, clearSelection };
}
