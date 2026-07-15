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

export type SelectionHandlePoint = {
  x: number;
  y: number;
  height: number;
};

export type SelectionHandleRects = {
  start: SelectionHandlePoint;
  end: SelectionHandlePoint;
};

type HandleDrag = {
  textEl: HTMLElement;
  // Word bounds of the fixed (non-dragged) edge. The live range is always
  // min/max of this anchor against the word under the finger, which also
  // yields the native role swap when a handle is dragged past the other one.
  anchorStart: number;
  anchorEnd: number;
  // Finger offset from the grabbed handle's line center, so drag hit-tests
  // sample the text line above the finger instead of the handle itself.
  offsetX: number;
  offsetY: number;
};

const ORIGINAL_TEXT_SELECTOR = "[data-original-text]";
const TOUCH_MOVE_THRESHOLD = 12;
// Touch selections place the menu further below the range so it never covers
// the drag handles hanging under the last line (~30px tall).
const HANDLE_MENU_GAP = 42;
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

function getMenuPosition(range: Range, belowGap: number = 8): { x: number; y: number } {
  const rect = range.getBoundingClientRect();
  const MENU_W = 280;
  const MENU_H = 170;
  const GAP = 8;

  let x = rect.left;
  let y = rect.bottom + belowGap;

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

function getTappedOriginalTextElement(clientX: number, clientY: number): HTMLElement | null {
  const el = document.elementFromPoint(clientX, clientY)?.closest(ORIGINAL_TEXT_SELECTOR);
  return el instanceof HTMLElement ? el : null;
}

// Last-resort hit test for browsers whose caret APIs fail (e.g. old Safari):
// scan the tapped sentence's characters and find the one under the point.
function getTextPointFromCharacterRects(clientX: number, clientY: number): TextPoint | null {
  const el = getTappedOriginalTextElement(clientX, clientY);
  if (!el) return null;

  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let node = walker.nextNode() as Text | null;

  while (node) {
    range.selectNodeContents(node);
    const nodeRect = range.getBoundingClientRect();

    if (
      clientX >= nodeRect.left && clientX <= nodeRect.right &&
      clientY >= nodeRect.top && clientY <= nodeRect.bottom
    ) {
      for (let i = 0; i < node.data.length; i += 1) {
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const rect = range.getBoundingClientRect();

        if (
          clientX >= rect.left && clientX <= rect.right &&
          clientY >= rect.top && clientY <= rect.bottom
        ) {
          return { textNode: node, offset: i };
        }
      }
    }

    node = walker.nextNode() as Text | null;
  }

  return null;
}

function getTextPointFromViewport(clientX: number, clientY: number): TextPoint | null {
  const doc = document as CaretDocument;
  const position = doc.caretPositionFromPoint?.(clientX, clientY);

  if (position) {
    return normalizeTextPoint(position.offsetNode, position.offset);
  }

  // Safari < 18.4 has no caretPositionFromPoint, and its caretRangeFromPoint
  // returns null over `user-select: none` text (the touch-device rule in
  // index.css). Temporarily re-enable selection on the tapped sentence while
  // measuring, then restore.
  if (doc.caretRangeFromPoint) {
    const el = getTappedOriginalTextElement(clientX, clientY);
    const prevUserSelect = el ? el.style.webkitUserSelect : "";
    const prevStandardUserSelect = el ? el.style.userSelect : "";

    if (el) {
      el.style.webkitUserSelect = "text";
      el.style.userSelect = "text";
    }

    try {
      const range = doc.caretRangeFromPoint(clientX, clientY);
      const point = range ? normalizeTextPoint(range.startContainer, range.startOffset) : null;
      if (point) return point;
    } finally {
      if (el) {
        el.style.webkitUserSelect = prevUserSelect;
        el.style.userSelect = prevStandardUserSelect;
      }
    }
  }

  return getTextPointFromCharacterRects(clientX, clientY);
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

// Text offset in the dragged sentence for the sampled point. Points that land
// outside the sentence clamp to its start/end; failed hit-tests inside it
// (line gaps) return null so the caller keeps the current range.
function getDragOffsetInSentence(
  textEl: HTMLElement,
  clientX: number,
  clientY: number,
): number | null {
  // The handle overlays hang below their line and can cover the next line of
  // a wrapped sentence, which would make the caret hit-test land on the empty
  // handle span. Ongoing touch events keep firing on their original target,
  // so disabling hit-testing on the handles during sampling is safe.
  const handles = document.querySelectorAll<HTMLElement>(".selection-handle");
  handles.forEach((h) => {
    h.style.pointerEvents = "none";
  });

  let point: TextPoint | null;
  try {
    point = getTextPointFromViewport(clientX, clientY);
  } finally {
    handles.forEach((h) => {
      h.style.pointerEvents = "";
    });
  }

  if (point) {
    const el = getElementFromNode(point.textNode)?.closest(ORIGINAL_TEXT_SELECTOR);
    if (el === textEl) {
      return getTextOffsetWithin(textEl, point.textNode, point.offset);
    }
  }

  const rect = textEl.getBoundingClientRect();
  if (clientY < rect.top || (clientY <= rect.bottom && clientX < rect.left)) return 0;
  if (clientY > rect.bottom || clientX > rect.right) return (textEl.textContent ?? "").length;
  return null;
}

export function useSelectionMenu({ containerRef, vocab }: {
  containerRef: RefObject<HTMLElement | null>;
  vocab: VocabController;
}): {
  menuOpen: boolean;
  menuPos: { x: number; y: number };
  selectedHighlight: SelectionHighlight | null;
  selectionHandles: SelectionHandleRects | null;
  handleMouseUp: (e: ReactMouseEvent<HTMLElement>) => void;
  handleTouchStart: (e: ReactTouchEvent<HTMLElement>) => void;
  handleTouchMove: (e: ReactTouchEvent<HTMLElement>) => void;
  handleTouchEnd: (e: ReactTouchEvent<HTMLElement>) => void;
  onHandleTouchStart: (which: "start" | "end", e: ReactTouchEvent<HTMLElement>) => void;
  onHandleTouchMove: (e: ReactTouchEvent<HTMLElement>) => void;
  onHandleTouchEnd: () => void;
  closeMenu: () => void;
  clearSelection: () => void;
} {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [selectedHighlight, setSelectedHighlight] = useState<SelectionHighlight | null>(null);
  const [selectionHandles, setSelectionHandles] = useState<SelectionHandleRects | null>(null);
  const touchStartRef = useRef<TouchStart | null>(null);
  const lastTouchLookupAtRef = useRef(0);
  // Ref mirror of selectedHighlight so rAF-throttled drag callbacks always
  // read the latest range instead of a stale render closure.
  const selectedHighlightRef = useRef<SelectionHighlight | null>(null);
  const dragRef = useRef<HandleDrag | null>(null);
  const dragRafRef = useRef<number | null>(null);
  const dragPointRef = useRef<{ x: number; y: number } | null>(null);

  function setHighlight(highlight: SelectionHighlight | null): void {
    selectedHighlightRef.current = highlight;
    setSelectedHighlight(highlight);
  }

  function dismissMenu(clearBrowserSelection: boolean): void {
    setMenuOpen(false);
    setHighlight(null);
    dragRef.current = null;
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
    setHighlight(null);

    setMenuPos(getMenuPosition(range));
    setMenuOpen(true);
  }

  // Commits a character range of a sentence as the current selection: sets
  // the highlight, hands the text to the vocab controller, and (re)opens the
  // menu next to the range. Shared by the single-word tap and handle drags.
  function applyRange(textEl: Element, start: number, end: number): boolean {
    const text = (textEl.textContent ?? "").slice(start, end).trim();
    if (!text) return false;

    const range = createRangeFromTextOffsets(textEl, start, end);
    if (!range) return false;

    const sentenceIdx = getSentenceIdxFromRange(range);
    if (sentenceIdx === null) return false;

    clearSelection();
    vocab.setSelectedText(text);
    vocab.setSelectedSentenceIdx(sentenceIdx);
    setHighlight({ sentenceIdx, start, end });

    setMenuPos(getMenuPosition(range, HANDLE_MENU_GAP));
    setMenuOpen(true);
    lastTouchLookupAtRef.current = Date.now();

    return true;
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

    return applyRange(textEl, word.start, word.end);
  }

  function getSelectedTextElement(highlight: SelectionHighlight): HTMLElement | null {
    const el = containerRef.current?.querySelector(
      `li[data-idx="${highlight.sentenceIdx}"] ${ORIGINAL_TEXT_SELECTOR}`,
    );
    return el instanceof HTMLElement ? el : null;
  }

  function updateDragRange(clientX: number, clientY: number): void {
    const drag = dragRef.current;
    const highlight = selectedHighlightRef.current;
    if (!drag || !highlight) return;

    const offset = getDragOffsetInSentence(
      drag.textEl,
      clientX - drag.offsetX,
      clientY - drag.offsetY,
    );
    if (offset === null) return;

    const word = getWordBounds(drag.textEl.textContent ?? "", offset);
    if (!word) return;

    const start = Math.min(drag.anchorStart, word.start);
    const end = Math.max(drag.anchorEnd, word.end);
    if (start === highlight.start && end === highlight.end) return;

    setHighlight({ sentenceIdx: highlight.sentenceIdx, start, end });
  }

  function onHandleTouchStart(
    which: "start" | "end",
    e: ReactTouchEvent<HTMLElement>,
  ): void {
    const highlight = selectedHighlightRef.current;
    const touch = e.touches[0];
    if (!highlight || !selectionHandles || !touch) return;

    const textEl = getSelectedTextElement(highlight);
    if (!textEl) return;

    const text = textEl.textContent ?? "";
    const anchor =
      which === "end"
        ? getWordBounds(text, highlight.start)
        : getWordBounds(text, Math.max(0, highlight.end - 1));
    const grabbed = which === "start" ? selectionHandles.start : selectionHandles.end;

    dragRef.current = {
      textEl,
      anchorStart: anchor ? anchor.start : highlight.start,
      anchorEnd: anchor ? anchor.end : highlight.end,
      offsetX: touch.clientX - grabbed.x,
      offsetY: touch.clientY - (grabbed.y + grabbed.height / 2),
    };

    // Hide the menu while dragging so it never covers the growing range.
    setMenuOpen(false);
  }

  function onHandleTouchMove(e: ReactTouchEvent<HTMLElement>): void {
    const touch = e.touches[0];
    if (!dragRef.current || !touch) return;

    dragPointRef.current = { x: touch.clientX, y: touch.clientY };
    if (dragRafRef.current !== null) return;

    // rAF throttle: at most one caret hit-test per frame.
    dragRafRef.current = requestAnimationFrame(() => {
      dragRafRef.current = null;
      const point = dragPointRef.current;
      if (point) updateDragRange(point.x, point.y);
    });
  }

  function onHandleTouchEnd(): void {
    const drag = dragRef.current;
    dragRef.current = null;
    dragPointRef.current = null;

    if (!drag) return;

    const highlight = selectedHighlightRef.current;
    if (!highlight || !applyRange(drag.textEl, highlight.start, highlight.end)) {
      closeMenu();
    }
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

  // Keep the fixed-position drag handles glued to both ends of the highlight,
  // recomputing whenever the range changes and through page/container scrolls.
  useEffect(() => {
    if (!selectedHighlight) {
      setSelectionHandles(null);
      return;
    }

    const textEl = getSelectedTextElement(selectedHighlight);
    if (!textEl) {
      setSelectionHandles(null);
      return;
    }

    function update(): void {
      const range = createRangeFromTextOffsets(
        textEl,
        selectedHighlight.start,
        selectedHighlight.end,
      );
      const rects = range
        ? Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0)
        : [];

      if (!rects.length) {
        setSelectionHandles(null);
        return;
      }

      const first = rects[0];
      const last = rects[rects.length - 1];
      setSelectionHandles({
        start: { x: first.left, y: first.top, height: first.height },
        end: { x: last.right, y: last.top, height: last.height },
      });
    }

    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [selectedHighlight]);

  useEffect(() => {
    return () => {
      if (dragRafRef.current !== null) cancelAnimationFrame(dragRafRef.current);
    };
  }, []);

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
    selectionHandles,
    handleMouseUp,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    onHandleTouchStart,
    onHandleTouchMove,
    onHandleTouchEnd,
    closeMenu,
    clearSelection,
  };
}
