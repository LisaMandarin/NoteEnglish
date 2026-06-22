import { useEffect, useRef, useState } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  RefObject,
  TouchEvent as ReactTouchEvent,
} from "react";

type VocabController = {
  reset: () => void;
  setSelectedText: (text: string) => void;
  setSelectedSentenceIdx: (idx: number) => void;
};

type CaretDocument = Document & {
  caretPositionFromPoint?: (
    x: number,
    y: number,
  ) => { offsetNode: Node; offset: number } | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

type TextPoint = {
  textNode: Text;
  offset: number;
};

type TouchStart = {
  x: number;
  y: number;
  moved: boolean;
};

export type SelectionHighlight = {
  sentenceIdx: number;
  start: number;
  end: number;
};

const ORIGINAL_TEXT_SELECTOR = "[data-original-text]";
const TOUCH_MOVE_THRESHOLD = 12;
const TOUCH_MOUSE_SUPPRESS_MS = 700;
const WORD_CHAR_RE = /[A-Za-z0-9'\u2018\u2019-]/;
const EDGE_WORD_PUNCT_RE = /['\u2018\u2019-]/;

function clearSelection(): void {
  const sel = window.getSelection?.();
  if (!sel) return;
  if (sel.rangeCount > 0 && sel.removeAllRanges) sel.removeAllRanges();
}

function getElementFromNode(node: Node | null): Element | null {
  if (!node) return null;
  return node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
}

function isOriginalTextTarget(target: EventTarget | null, container: HTMLElement): boolean {
  if (!(target instanceof Node)) return false;
  const el = getElementFromNode(target);
  const originalText = el?.closest(ORIGINAL_TEXT_SELECTOR);
  return !!originalText && container.contains(originalText);
}

function isFormControlTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Node)) return false;
  const el = getElementFromNode(target);
  return !!el?.closest("button, input, textarea, select, [contenteditable='true']");
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

function normalizeTextPoint(node: Node, offset: number): TextPoint | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return { textNode: node as Text, offset };
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const element = node as Element;
  const nextChild = element.childNodes[offset] ?? null;
  const previousChild = element.childNodes[Math.max(0, offset - 1)] ?? null;

  if (nextChild?.nodeType === Node.TEXT_NODE) {
    return { textNode: nextChild as Text, offset: 0 };
  }

  if (previousChild?.nodeType === Node.TEXT_NODE) {
    const textNode = previousChild as Text;
    return { textNode, offset: textNode.data.length };
  }

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const textNode = walker.nextNode() as Text | null;
  return textNode ? { textNode, offset: 0 } : null;
}

function getTextPointFromViewport(clientX: number, clientY: number): TextPoint | null {
  const doc = document as CaretDocument;
  const position = doc.caretPositionFromPoint?.(clientX, clientY);

  if (position) {
    return normalizeTextPoint(position.offsetNode, position.offset);
  }

  const range = doc.caretRangeFromPoint?.(clientX, clientY);
  if (!range) return null;

  return normalizeTextPoint(range.startContainer, range.startOffset);
}

function getTextOffsetWithin(root: Element, textNode: Text, offset: number): number | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let currentOffset = 0;
  let node = walker.nextNode() as Text | null;

  while (node) {
    if (node === textNode) {
      return currentOffset + Math.min(offset, node.data.length);
    }

    currentOffset += node.data.length;
    node = walker.nextNode() as Text | null;
  }

  return null;
}

function createRangeFromTextOffsets(root: Element, start: number, end: number): Range | null {
  const range = document.createRange();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let currentOffset = 0;
  let hasStart = false;
  let node = walker.nextNode() as Text | null;

  while (node) {
    const nextOffset = currentOffset + node.data.length;

    if (!hasStart && start >= currentOffset && start <= nextOffset) {
      range.setStart(node, Math.min(start - currentOffset, node.data.length));
      hasStart = true;
    }

    if (hasStart && end >= currentOffset && end <= nextOffset) {
      range.setEnd(node, Math.min(end - currentOffset, node.data.length));
      return range;
    }

    currentOffset = nextOffset;
    node = walker.nextNode() as Text | null;
  }

  return null;
}

function isWordChar(char: string | undefined): boolean {
  return !!char && WORD_CHAR_RE.test(char);
}

function getWordBounds(text: string, offset: number): { start: number; end: number; text: string } | null {
  if (!text) return null;

  let index = Math.min(offset, text.length - 1);

  if (!isWordChar(text[index]) && index > 0 && isWordChar(text[index - 1])) {
    index -= 1;
  } else if (!isWordChar(text[index]) && offset < text.length && isWordChar(text[offset])) {
    index = offset;
  }

  if (!isWordChar(text[index])) return null;

  let start = index;
  let end = index + 1;

  while (start > 0 && isWordChar(text[start - 1])) start -= 1;
  while (end < text.length && isWordChar(text[end])) end += 1;

  while (start < end && EDGE_WORD_PUNCT_RE.test(text[start])) start += 1;
  while (end > start && EDGE_WORD_PUNCT_RE.test(text[end - 1])) end -= 1;

  const selectedText = text.slice(start, end).trim();
  return selectedText ? { start, end, text: selectedText } : null;
}

export function useSelectionMenu({ containerRef, vocab }: {
  containerRef: RefObject<HTMLElement | null>;
  vocab: VocabController;
}): {
  menuOpen: boolean;
  menuPos: { x: number; y: number };
  selectedHighlight: SelectionHighlight | null;
  handleMouseUp: (e: ReactMouseEvent<HTMLElement>) => void;
  handleTouchStart: (e: ReactTouchEvent<HTMLElement>) => void;
  handleTouchMove: (e: ReactTouchEvent<HTMLElement>) => void;
  handleTouchEnd: (e: ReactTouchEvent<HTMLElement>) => void;
  closeMenu: () => void;
  clearSelection: () => void;
} {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [selectedHighlight, setSelectedHighlight] = useState<SelectionHighlight | null>(null);
  const touchStartRef = useRef<TouchStart | null>(null);
  const lastTouchLookupAtRef = useRef(0);

  function dismissMenu(clearBrowserSelection: boolean): void {
    setMenuOpen(false);
    setSelectedHighlight(null);
    vocab.reset();
    if (clearBrowserSelection) clearSelection();
  }

  function closeMenu(): void {
    dismissMenu(true);
  }

  function handleMouseUp(e: ReactMouseEvent<HTMLElement>): void {
    if (Date.now() - lastTouchLookupAtRef.current < TOUCH_MOUSE_SUPPRESS_MS) return;

    const container = containerRef.current;
    if (!container) return;

    // Form controls manage their own focus and text selection. Clearing the
    // document selection here can disturb a textarea caret in some browsers.
    if (isFormControlTarget(e.target)) {
      dismissMenu(false);
      return;
    }

    // Vocabulary lookup is only supported for the English source sentence.
    if (!isOriginalTextTarget(e.target, container)) return closeMenu();

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return closeMenu();

    const text = sel.toString().trim();
    if (!text) return closeMenu();

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
    setSelectedHighlight(null);

    setMenuPos(getMenuPosition(range));
    setMenuOpen(true);
  }

  function selectWordAtPoint(clientX: number, clientY: number): boolean {
    const container = containerRef.current;
    if (!container) return false;

    const point = getTextPointFromViewport(clientX, clientY);
    if (!point) return false;

    const textEl = getElementFromNode(point.textNode)?.closest(ORIGINAL_TEXT_SELECTOR);
    if (!textEl || !container.contains(textEl)) return false;

    const textOffset = getTextOffsetWithin(textEl, point.textNode, point.offset);
    if (textOffset === null) return false;

    const word = getWordBounds(textEl.textContent ?? "", textOffset);
    if (!word) return false;

    const range = createRangeFromTextOffsets(textEl, word.start, word.end);
    if (!range) return false;

    const sentenceIdx = getSentenceIdxFromRange(range);
    if (sentenceIdx === null) return false;

    clearSelection();
    vocab.setSelectedText(word.text);
    vocab.setSelectedSentenceIdx(sentenceIdx);
    setSelectedHighlight({ sentenceIdx, start: word.start, end: word.end });

    setMenuPos(getMenuPosition(range));
    setMenuOpen(true);
    lastTouchLookupAtRef.current = Date.now();

    return true;
  }

  function handleTouchStart(e: ReactTouchEvent<HTMLElement>): void {
    const container = containerRef.current;
    const touch = e.touches[0];

    touchStartRef.current = null;

    if (!container || !touch || !isOriginalTextTarget(e.target, container)) return;

    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      moved: false,
    };
  }

  function handleTouchMove(e: ReactTouchEvent<HTMLElement>): void {
    const start = touchStartRef.current;
    const touch = e.touches[0];
    if (!start || !touch) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;

    if (Math.hypot(dx, dy) > TOUCH_MOVE_THRESHOLD) {
      start.moved = true;
    }
  }

  function handleTouchEnd(e: ReactTouchEvent<HTMLElement>): void {
    const start = touchStartRef.current;
    const touch = e.changedTouches[0];

    touchStartRef.current = null;

    if (!start || !touch || start.moved) return;

    if (e.cancelable) e.preventDefault();

    if (!selectWordAtPoint(touch.clientX, touch.clientY)) {
      closeMenu();
    }
  }

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent): void {
      if (!menuOpen) return;
      if (!containerRef.current?.contains(e.target as Node)) closeMenu();
    }
    function onDocTouchStart(e: TouchEvent): void {
      if (!menuOpen) return;
      if (!containerRef.current?.contains(e.target as Node)) closeMenu();
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("touchstart", onDocTouchStart);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("touchstart", onDocTouchStart);
    };
  }, [menuOpen]);

  return {
    menuOpen,
    menuPos,
    selectedHighlight,
    handleMouseUp,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    closeMenu,
    clearSelection,
  };
}
