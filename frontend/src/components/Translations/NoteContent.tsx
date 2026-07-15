import { useEffect, useMemo, useState } from "react";
import { Button, Popover } from "antd";
import { LinkOutlined } from "@ant-design/icons";
import type { LinkPreview } from "../../types";
import { fetchLinkPreview } from "../../lib/api";
import { sanitizeNoteHtml } from "../../lib/noteHtml";

// Renders a rich note: sanitize → parse → React nodes. Going through React
// (instead of dangerouslySetInnerHTML) is what lets each <a> carry a preview
// Popover and its own click handling. Only whitelist tags survive
// sanitizeNoteHtml, so the converter below covers every possible node.

function domain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function PreviewCard({ url }: { url: string }): React.ReactElement {
  const [preview, setPreview] = useState<LinkPreview | null | "loading">("loading");
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchLinkPreview(url).then((p) => {
      if (!cancelled) setPreview(p);
    });
    return (): void => {
      cancelled = true;
    };
  }, [url]);

  const loaded = preview !== "loading" ? preview : null;

  return (
    <div className="note-link-preview">
      {loaded?.image && !imgFailed && (
        <img
          src={loaded.image}
          alt=""
          aria-hidden="true"
          referrerPolicy="no-referrer"
          className="note-link-preview__img"
          onError={() => setImgFailed(true)}
        />
      )}
      <div className="note-link-preview__domain">
        <LinkOutlined aria-hidden="true" /> {loaded?.site_name || domain(url)}
      </div>
      {preview === "loading" ? (
        <div className="note-link-preview__desc">載入中…</div>
      ) : (
        <>
          {loaded?.title && <div className="note-link-preview__title">{loaded.title}</div>}
          {loaded?.description && (
            <div className="note-link-preview__desc">{loaded.description}</div>
          )}
        </>
      )}
    </div>
  );
}

function NoteLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}): React.ReactElement {
  // Touch devices get click-to-preview (first tap opens the card, the card's
  // button navigates); fine pointers get hover preview + normal click-through.
  const coarse = useMemo(() => window.matchMedia("(pointer: coarse)").matches, []);
  const [open, setOpen] = useState(false);

  const content = (
    <div>
      <PreviewCard url={href} />
      {coarse && (
        <Button
          size="small"
          type="primary"
          className="mt-2"
          onClick={() => {
            setOpen(false);
            window.open(href, "_blank", "noopener,noreferrer");
          }}
        >
          開啟連結
        </Button>
      )}
    </div>
  );

  return (
    <Popover
      content={content}
      trigger={coarse ? ["click"] : ["hover"]}
      placement="top"
      open={coarse ? open : undefined}
      onOpenChange={coarse ? setOpen : undefined}
    >
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          // Never bubble up to the note card's open-editor click. On touch,
          // the first tap only opens the preview card.
          e.stopPropagation();
          if (coarse) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {children}
      </a>
    </Popover>
  );
}

const TAG_MAP: Record<string, keyof React.JSX.IntrinsicElements> = {
  p: "p",
  strong: "strong",
  b: "b",
  em: "em",
  i: "i",
  u: "u",
  ul: "ul",
  ol: "ol",
  li: "li",
  span: "span",
};

function toReact(node: Node, key: number): React.ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (!(node instanceof Element)) return null;

  const tag = node.tagName.toLowerCase();
  const children = Array.from(node.childNodes).map((child, i) => toReact(child, i));

  if (tag === "br") return <br key={key} />;
  if (tag === "a") {
    const href = node.getAttribute("href");
    // Sanitizer strips non-http(s) hrefs; render those as plain text.
    if (!href) return <span key={key}>{children}</span>;
    return (
      <NoteLink key={key} href={href}>
        {children}
      </NoteLink>
    );
  }

  const Tag = TAG_MAP[tag];
  if (!Tag) return <span key={key}>{children}</span>;
  const color = (node as HTMLElement).style?.color;
  return (
    <Tag key={key} style={color ? { color } : undefined}>
      {children}
    </Tag>
  );
}

export default function NoteContent({ note }: { note: string }): React.ReactElement {
  const nodes = useMemo(() => {
    const doc = new DOMParser().parseFromString(sanitizeNoteHtml(note), "text/html");
    return Array.from(doc.body.childNodes).map((child, i) => toReact(child, i));
  }, [note]);

  return <div className="note-content">{nodes}</div>;
}
