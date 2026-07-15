import DOMPurify from "dompurify";

// Rich-note HTML utilities. Notes are stored in session_sentences.note either
// as legacy plain text or as Tiptap-generated HTML. Notes travel to OTHER
// users through the share feature, so every render path (main card, shared
// view, summary window) must go through sanitizeNoteHtml — never trust the
// stored string, the editor output, or localStorage.

// Fixed note text palette. Every color must read ≥ 4.5:1 (WCAG AA) on both
// white and --card-bg (#f3fafa) — verified 2026-07-16:
//   #b91c1c 6.1:1 · #b45309 4.7:1 · #15803d 4.7:1 · #1d4ed8 6.3:1 · #7e22ce 6.6:1
export const NOTE_COLORS: { label: string; value: string }[] = [
  { label: "紅", value: "#b91c1c" },
  { label: "橘", value: "#b45309" },
  { label: "綠", value: "#15803d" },
  { label: "藍", value: "#1d4ed8" },
  { label: "紫", value: "#7e22ce" },
];

const ALLOWED_TAGS = ["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "a", "span"];
const ALLOWED_ATTR = ["href", "target", "rel", "style"];

// Single hook set, registered once. DOMPurify hooks are global, so we guard
// against double registration under HMR.
let hooksRegistered = false;
function registerHooks(): void {
  if (hooksRegistered) return;
  hooksRegistered = true;

  DOMPurify.addHook("afterSanitizeAttributes", (node: Element) => {
    const tag = node.tagName;

    // style is only meaningful on span, and only its color survives.
    if (node.hasAttribute("style")) {
      const color = (node as HTMLElement).style?.color ?? "";
      if (tag === "SPAN" && color) {
        node.setAttribute("style", `color: ${color}`);
      } else {
        node.removeAttribute("style");
      }
    }

    if (tag === "A") {
      const href = node.getAttribute("href") ?? "";
      if (!/^https?:\/\//i.test(href)) {
        node.removeAttribute("href");
      }
      // Links always open a new tab and never leak the opener, regardless of
      // what the stored HTML claims.
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    } else {
      node.removeAttribute("target");
      node.removeAttribute("rel");
    }
  });
}

export function sanitizeNoteHtml(html: string): string {
  registerHooks();
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
}

// Legacy notes are plain text (pre-rich-editor). Anything that doesn't start
// with a block tag the editor emits is treated as legacy and rendered
// pre-wrap, exactly as before.
export function isLegacyPlainText(note: string): boolean {
  const trimmed = note.trimStart().toLowerCase();
  return !(trimmed.startsWith("<p") || trimmed.startsWith("<ul") || trimmed.startsWith("<ol"));
}

// Replaces note.trim().length > 0: an HTML note like "<p></p>" is empty even
// though the string isn't.
export function noteHasContent(note: string): boolean {
  if (!note) return false;
  if (isLegacyPlainText(note)) return note.trim().length > 0;
  const doc = new DOMParser().parseFromString(sanitizeNoteHtml(note), "text/html");
  return (doc.body.textContent ?? "").trim().length > 0;
}

// Converts a legacy plain-text note into HTML paragraphs so Tiptap can load
// it; the note upgrades to stored HTML on the next save.
export function legacyTextToHtml(text: string): string {
  const escapeHtml = (s: string): string =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .split("\n")
    .map((line) => (line.trim() ? `<p>${escapeHtml(line)}</p>` : "<p></p>"))
    .join("");
}
