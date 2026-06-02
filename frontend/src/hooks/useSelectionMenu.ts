import { useEffect, useState } from "react";
import type { RefObject } from "react";

type VocabController = {
  reset: () => void;
  setSelectedText: (text: string) => void;
  setSelectedSentenceIdx: (idx: number) => void;
};

function clearSelection(): void {
  const sel = window.getSelection?.();
  if (!sel) return;
  if (sel.rangeCount > 0 && sel.removeAllRanges) sel.removeAllRanges();
}

function getSentenceIdxFromRange(range: Range): number | null {
  const containerNode = range.commonAncestorContainer;
  const el =
    containerNode.nodeType === 1 ? containerNode as Element : (containerNode as Node).parentElement;
  const li = el?.closest("li[data-idx]");
  return li ? Number((li as HTMLElement).dataset.idx) : null;
}

function getMenuPosition(range: Range): { x: number; y: number } {
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

export function useSelectionMenu({ containerRef, vocab }: {
  containerRef: RefObject<HTMLElement | null>;
  vocab: VocabController;
}): {
  menuOpen: boolean;
  menuPos: { x: number; y: number };
  handleMouseUp: () => void;
  closeMenu: () => void;
  clearSelection: () => void;
} {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });

  function closeMenu(): void {
    setMenuOpen(false);
    vocab.reset();
    clearSelection();
  }

  function handleMouseUp(): void {
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
        ? commonAncestor as Element
        : (commonAncestor as Node).parentElement;

    if (!node || !container.contains(node)) return closeMenu();

    const sentenceIdx = getSentenceIdxFromRange(range);
    if (sentenceIdx === null) return closeMenu();

    vocab.setSelectedText(text);
    vocab.setSelectedSentenceIdx(sentenceIdx);

    setMenuPos(getMenuPosition(range));
    setMenuOpen(true);
  }

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent): void {
      if (!menuOpen) return;
      if (!containerRef.current?.contains(e.target as Node)) closeMenu();
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [menuOpen]);

  return { menuOpen, menuPos, handleMouseUp, closeMenu, clearSelection };
}
