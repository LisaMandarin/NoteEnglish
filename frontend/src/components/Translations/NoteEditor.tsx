import { useMemo, useRef, useState } from "react";
import { Button, Input, Popover, Tooltip } from "antd";
import {
  BoldOutlined,
  FontColorsOutlined,
  ItalicOutlined,
  LinkOutlined,
  OrderedListOutlined,
  RedoOutlined,
  UnderlineOutlined,
  UndoOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { Placeholder } from "@tiptap/extensions";
import {
  NOTE_COLORS,
  isLegacyPlainText,
  legacyTextToHtml,
  sanitizeNoteHtml,
} from "../../lib/noteHtml";

type ToolbarState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  bulletList: boolean;
  orderedList: boolean;
  link: boolean;
  color: string | null;
  canUndo: boolean;
  canRedo: boolean;
};

function normalizeUrl(raw: string): string | null {
  const url = raw.trim();
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  // No scheme typed: assume https. Anything else (javascript:, ftp:, …) is rejected.
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return null;
  return `https://${url}`;
}

function ToolbarButtons({
  editor,
  state,
  container,
  compact = false,
}: {
  editor: Editor;
  state: ToolbarState;
  container: () => HTMLElement;
  compact?: boolean;
}): React.ReactElement {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  // Keep the editor selection/focus alive while clicking toolbar buttons.
  const keepFocus = (e: React.MouseEvent): void => e.preventDefault();

  function toggleButton(
    label: string,
    icon: React.ReactNode,
    active: boolean,
    onClick: () => void,
    disabled = false,
  ): React.ReactElement {
    return (
      <Tooltip title={compact ? undefined : label} key={label}>
        <Button
          size="small"
          type="text"
          aria-label={label}
          aria-pressed={active}
          disabled={disabled}
          className={active ? "note-toolbar-btn note-toolbar-btn--active" : "note-toolbar-btn"}
          icon={icon}
          onMouseDown={keepFocus}
          onClick={onClick}
        />
      </Tooltip>
    );
  }

  function applyLink(): void {
    const url = normalizeUrl(linkUrl);
    if (!url) return;
    const chain = editor.chain().focus().extendMarkRange("link");
    if (editor.state.selection.empty && !state.link) {
      chain
        .insertContent({
          type: "text",
          text: url,
          marks: [{ type: "link", attrs: { href: url } }],
        })
        .run();
    } else {
      chain.setLink({ href: url }).run();
    }
    setLinkOpen(false);
    setLinkUrl("");
  }

  const colorPanel = (
    <div className="note-color-panel" role="group" aria-label="筆記文字顏色">
      {NOTE_COLORS.map((c) => (
        <button
          key={c.value}
          type="button"
          aria-label={`文字顏色：${c.label}`}
          className={`note-color-swatch${state.color === c.value ? " note-color-swatch--active" : ""}`}
          style={{ backgroundColor: c.value }}
          onMouseDown={keepFocus}
          onClick={() => editor.chain().focus().setColor(c.value).run()}
        />
      ))}
      <button
        type="button"
        aria-label="恢復預設顏色"
        className="note-color-swatch note-color-swatch--default"
        onMouseDown={keepFocus}
        onClick={() => editor.chain().focus().unsetColor().run()}
      >
        A
      </button>
    </div>
  );

  return (
    <>
      {toggleButton("粗體", <BoldOutlined />, state.bold, () =>
        editor.chain().focus().toggleBold().run(),
      )}
      {toggleButton("斜體", <ItalicOutlined />, state.italic, () =>
        editor.chain().focus().toggleItalic().run(),
      )}
      {toggleButton("底線", <UnderlineOutlined />, state.underline, () =>
        editor.chain().focus().toggleUnderline().run(),
      )}
      <Popover
        content={colorPanel}
        trigger={["click"]}
        placement="bottom"
        getPopupContainer={container}
      >
        <Button
          size="small"
          type="text"
          aria-label="文字顏色"
          className="note-toolbar-btn"
          icon={<FontColorsOutlined style={state.color ? { color: state.color } : undefined} />}
          onMouseDown={keepFocus}
        />
      </Popover>
      {toggleButton("項目符號清單", <UnorderedListOutlined />, state.bulletList, () =>
        editor.chain().focus().toggleBulletList().run(),
      )}
      {toggleButton("編號清單", <OrderedListOutlined />, state.orderedList, () =>
        editor.chain().focus().toggleOrderedList().run(),
      )}
      <Popover
        open={linkOpen}
        onOpenChange={(open) => {
          setLinkOpen(open);
          if (open) setLinkUrl(editor.getAttributes("link").href ?? "");
        }}
        trigger={["click"]}
        placement="bottom"
        getPopupContainer={container}
        content={
          <div className="note-link-form">
            <Input
              size="small"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onPressEnter={applyLink}
              placeholder="https://…"
              aria-label="連結網址"
              autoFocus
            />
            <Button size="small" type="primary" onClick={applyLink}>
              確定
            </Button>
            {state.link && (
              <Button
                size="small"
                onMouseDown={keepFocus}
                onClick={() => {
                  editor.chain().focus().extendMarkRange("link").unsetLink().run();
                  setLinkOpen(false);
                }}
              >
                移除
              </Button>
            )}
          </div>
        }
      >
        <Button
          size="small"
          type="text"
          aria-label="插入連結"
          aria-pressed={state.link}
          className={state.link ? "note-toolbar-btn note-toolbar-btn--active" : "note-toolbar-btn"}
          icon={<LinkOutlined />}
          onMouseDown={keepFocus}
        />
      </Popover>
      {!compact && (
        <>
          {toggleButton(
            "復原",
            <UndoOutlined />,
            false,
            () => editor.chain().focus().undo().run(),
            !state.canUndo,
          )}
          {toggleButton(
            "重做",
            <RedoOutlined />,
            false,
            () => editor.chain().focus().redo().run(),
            !state.canRedo,
          )}
        </>
      )}
    </>
  );
}

export default function NoteEditor({
  initialNote,
  onDraftChange,
  onSave,
}: {
  initialNote: string;
  // Fires on every edit with the current HTML ('' when empty) — drives the
  // parent's 2s debounce safety net, same contract as the old TextArea.
  onDraftChange: (html: string) => void;
  // Fires when focus leaves the editor area entirely (blur save path).
  onSave: () => void;
}): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  // Only offer the BubbleMenu on fine pointers; on touch it fights the native
  // selection handles.
  const finePointer = useMemo(() => window.matchMedia("(pointer: fine)").matches, []);

  const initialContent = useMemo(
    () =>
      isLegacyPlainText(initialNote)
        ? legacyTextToHtml(initialNote)
        : sanitizeNoteHtml(initialNote),
    [initialNote],
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        code: false,
        codeBlock: false,
        strike: false,
        horizontalRule: false,
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
          protocols: ["http", "https"],
        },
      }),
      TextStyle,
      Color,
      Placeholder.configure({ placeholder: "輸入筆記…" }),
    ],
    content: initialContent,
    autofocus: "end",
    onUpdate: ({ editor: ed }) => {
      onDraftChange(ed.isEmpty ? "" : ed.getHTML());
    },
    onBlur: ({ event }) => {
      // Ignore focus moves inside the editor block (toolbar buttons, link
      // popover — popups render into the container via getPopupContainer).
      const next = event.relatedTarget;
      if (next instanceof Node && containerRef.current?.contains(next)) return;
      onSave();
    },
  });

  const state = useEditorState({
    editor,
    selector: (ctx): ToolbarState | null =>
      ctx.editor
        ? {
            bold: ctx.editor.isActive("bold"),
            italic: ctx.editor.isActive("italic"),
            underline: ctx.editor.isActive("underline"),
            bulletList: ctx.editor.isActive("bulletList"),
            orderedList: ctx.editor.isActive("orderedList"),
            link: ctx.editor.isActive("link"),
            color: (ctx.editor.getAttributes("textStyle").color as string | undefined) ?? null,
            canUndo: ctx.editor.can().undo(),
            canRedo: ctx.editor.can().redo(),
          }
        : null,
  });

  const container = (): HTMLElement => containerRef.current ?? document.body;

  if (!editor || !state) return <div ref={containerRef} />;

  return (
    <div ref={containerRef} className="note-editor">
      <div className="note-toolbar" role="toolbar" aria-label="筆記格式工具列">
        <ToolbarButtons editor={editor} state={state} container={container} />
      </div>
      {finePointer && (
        <BubbleMenu
          editor={editor}
          className="note-bubble-menu"
          // 固定出現在選取文字下方，避免蓋住編輯器上方的常駐工具列
          options={{ placement: "bottom", offset: 8 }}
        >
          <ToolbarButtons editor={editor} state={state} container={container} compact />
        </BubbleMenu>
      )}
      <EditorContent editor={editor} className="note-editor-content" />
    </div>
  );
}
