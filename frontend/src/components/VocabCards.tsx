import { useEffect, useMemo, useRef, useState } from "react";
import type { VocabItem } from "../types";
import { CheckOutlined, DeleteTwoTone, EditTwoTone, MinusCircleOutlined, PlusCircleOutlined, QuestionCircleOutlined, SoundOutlined } from '@ant-design/icons';
import { speak } from "../lib/speech";
import { Modal, Tooltip } from 'antd';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ── Constants ────────────────────────────────────────────────────────────────

const CEFR_TOOLTIP = (
  <div className="text-xs leading-relaxed space-y-0.5">
    <div><strong>CEFR Levels</strong></div>
    <div>A1 · A2 — Beginner</div>
    <div>B1 · B2 — Intermediate</div>
    <div>C1 · C2 — Advanced</div>
  </div>
);

const LEVEL_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];

const POS_LABELS: Record<string, string> = {
  "n.": "名詞",
  "v.": "動詞",
  "pron.": "代名詞",
  "propn.": "專有名詞",
  "adj.": "形容詞",
  "adv.": "副詞",
  "prep.": "介系詞",
  "conj.": "連接詞",
  "aux.": "助動詞",
  "phr.": "片語",
  "interj.": "感嘆詞",
};

// ── Pure helpers ─────────────────────────────────────────────────────────────

function itemId(v: VocabItem): string {
  return `${v.lemma ?? v.text}-${v.pos ?? "unknown"}`;
}

function getLevelInfo(level?: string): { filled: number; total: number; color: string } {
  const idx = LEVEL_ORDER.indexOf((level ?? "").toUpperCase());
  if (idx === -1) return { filled: 0, total: 6, color: "bg-gray-400" };
  const color = idx < 2 ? "bg-green-500" : idx < 4 ? "bg-amber-500" : "bg-red-500";
  return { filled: idx + 1, total: 6, color };
}

function getPosStyle(_pos?: string) {
  return "bg-(--accent)/15 text-(--accent)";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function HighlightedExample({ example, lemma, text }: { example: string; lemma?: string; text?: string }) {
  const word = text || lemma || "";
  if (!word || !example) return <span>{example}</span>;

  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = example.split(new RegExp(`(${escaped})`, "gi"));

  return (
    <span>
      {parts.map((part: string, i: number) =>
        part.toLowerCase() === word.toLowerCase() ? (
          <mark key={i} className="bg-purple-100 text-purple-700 rounded px-0.5 not-italic print:bg-transparent print:text-inherit print:font-bold">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

function LevelDots({ level }: { level?: string }) {
  if (!level) return null;
  const { filled, total, color } = getLevelInfo(level);
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`level-dot inline-block w-2.5 h-2.5 rounded-full ${
            i < filled ? `level-dot-filled ${color}` : "level-dot-empty border border-gray-300 bg-transparent"
          }`}
        />
      ))}
    </div>
  );
}

function SortableVocabCard({ id, v, onDelete, onEdit }: { id: string; v: VocabItem; onDelete?: () => void; onEdit?: (updates: Partial<VocabItem>) => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <VocabCard v={v} onDelete={onDelete} onEdit={onEdit} dragProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

// ── Exported components ───────────────────────────────────────────────────────


const MAX_OTHERS = 5;

type EditDraft = { translation: string; definition: string; example: string; others: string[] };

function buildUpdates(d: EditDraft): Partial<VocabItem> {
  const { others, ...rest } = d;
  const otherFields: Partial<VocabItem> = {};
  for (let i = 1; i <= MAX_OTHERS; i++) {
    (otherFields as Record<string, string | undefined>)[`other_${i}`] = others[i - 1];
  }
  return { ...rest, ...otherFields };
}

export function VocabCard({ v, onDelete, onEdit, dragProps, readOnly = false }: { v: VocabItem; onDelete?: () => void; onEdit?: (updates: Partial<VocabItem>) => void; dragProps?: object; readOnly?: boolean }) {
  const head = (v.lemma ?? v.text ?? "").trim();
  const hasContent = v.definition || v.example || [1,2,3,4,5].some(i => (v as Record<string, unknown>)[`other_${i}`]);

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<EditDraft>({ translation: "", definition: "", example: "", others: [] });
  const cardRef = useRef<HTMLDivElement>(null);
  const isConfirmingRef = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const onEditRef = useRef(onEdit);
  onEditRef.current = onEdit;

  useEffect(() => {
    if (!isEditing) return;

    function handleOutsideMousedown(e: MouseEvent): void {
      if (isConfirmingRef.current) return;
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        isConfirmingRef.current = true;
        Modal.confirm({
          title: '離開編輯',
          content: '要儲存還是取消編輯？',
          okText: '完成編輯',
          cancelText: '取消編輯',
          onOk: () => {
            isConfirmingRef.current = false;
            onEditRef.current?.(buildUpdates(draftRef.current));
            setIsEditing(false);
          },
          onCancel: () => {
            isConfirmingRef.current = false;
            setIsEditing(false);
          },
        });
      }
    }

    document.addEventListener('mousedown', handleOutsideMousedown);
    return () => document.removeEventListener('mousedown', handleOutsideMousedown);
  }, [isEditing]);

  function enterEdit(e: React.MouseEvent): void {
    e.stopPropagation();
    const others: string[] = [];
    for (let i = 1; i <= MAX_OTHERS; i++) {
      const val = (v as Record<string, unknown>)[`other_${i}`] as string | undefined;
      if (val != null) others.push(val);
    }
    setDraft({ translation: v.translation ?? "", definition: v.definition ?? "", example: v.example ?? "", others });
    setIsEditing(true);
  }

  function commitEdit(): void {
    onEditRef.current?.(buildUpdates(draftRef.current));
    setIsEditing(false);
  }

  function handleTranslationKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
    if (e.key === "Escape") setIsEditing(false);
  }

  function handleTextareaKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === "Escape") setIsEditing(false);
  }

  return (
    <div
      ref={cardRef}
      {...(!readOnly && !isEditing ? dragProps : {})}
      className={`rounded-2xl border border-(--card-border) bg-(--card-bg) p-4 shadow-sm flex flex-col min-h-50 min-w-0 ${isEditing ? "select-text" : "select-none"} ${readOnly || isEditing ? "" : "cursor-grab active:cursor-grabbing"}`}
    >
      {/* Word + POS badge */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg font-bold text-(--text-main)">{head || "vocab"}</span>
        <Tooltip title={v.pos ? POS_LABELS[v.pos] : undefined}>
          <span className={`rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${getPosStyle(v.pos)}`}>
            {v.pos ?? "—"}
          </span>
        </Tooltip>
        {head && !readOnly && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); speak(head); }}
            className="ml-auto text-gray-400 hover:text-(--accent) transition-colors cursor-pointer"
            aria-label={`Pronounce ${head}`}
          >
            <SoundOutlined />
          </button>
        )}
      </div>

      {/* Editable content area */}
      {isEditing ? (
        <div
          className="flex-1 flex flex-col gap-2"
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="text"
            value={draft.translation}
            onChange={(e) => setDraft((d) => ({ ...d, translation: e.target.value }))}
            onKeyDown={handleTranslationKeyDown}
            autoFocus
            placeholder="Translation"
            className="text-2xl font-bold text-(--text-main) w-full border-b-2 border-(--accent) bg-transparent outline-none pb-0.5"
          />
          <textarea
            value={draft.definition}
            onChange={(e) => setDraft((d) => ({ ...d, definition: e.target.value }))}
            onKeyDown={handleTextareaKeyDown}
            placeholder="Definition"
            rows={2}
            className="text-sm text-(--text-main) w-full border border-(--card-border) rounded-lg px-2 py-1 bg-transparent outline-none resize-none focus:border-(--accent)"
          />
          <textarea
            value={draft.example}
            onChange={(e) => setDraft((d) => ({ ...d, example: e.target.value }))}
            onKeyDown={handleTextareaKeyDown}
            placeholder="Example sentence"
            rows={2}
            className="text-sm text-(--text-main) w-full border border-(--card-border) rounded-lg px-2 py-1 bg-transparent outline-none resize-none focus:border-(--accent)"
          />
          {draft.others.map((val, idx) => (
            <div key={idx} className="flex items-start gap-1">
              <textarea
                value={val}
                onChange={(e) => setDraft((d) => {
                  const next = [...d.others];
                  next[idx] = e.target.value;
                  return { ...d, others: next };
                })}
                onKeyDown={handleTextareaKeyDown}
                placeholder={`Note ${idx + 1}`}
                rows={2}
                className="text-sm text-(--text-main) w-full border border-(--card-border) rounded-lg px-2 py-1 bg-transparent outline-none resize-none focus:border-(--accent)"
              />
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); setDraft((d) => ({ ...d, others: d.others.filter((_, i) => i !== idx) })); }}
                className="mt-1 shrink-0 text-gray-400 hover:text-red-400 transition-colors cursor-pointer"
                aria-label="Remove note"
              >
                <MinusCircleOutlined />
              </button>
            </div>
          ))}
          {draft.others.length < MAX_OTHERS && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); setDraft((d) => ({ ...d, others: [...d.others, ""] })); }}
              className="self-start flex items-center gap-1 text-xs text-(--accent) hover:opacity-70 transition-opacity cursor-pointer"
              aria-label="Add note"
            >
              <PlusCircleOutlined />
              <span>新增欄位</span>
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Chinese translation */}
          {v.translation && (
            <div className="text-2xl font-bold text-(--text-main) mb-2">{v.translation}</div>
          )}

          {/* Definition + Example */}
          <div className="flex-1">
            {hasContent && (
              <div className="space-y-2">
                {v.definition && (
                  <p className="text-sm text-(--text-main) leading-relaxed">{v.definition}</p>
                )}
                {v.example && (
                  <div className="rounded-lg bg-gray-100 px-3 py-2 text-sm flex items-start gap-2">
                    {!readOnly && (
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); speak(v.example!); }}
                        className="mt-0.5 shrink-0 text-gray-400 hover:text-(--accent) transition-colors cursor-pointer"
                        aria-label="Pronounce example"
                      >
                        <SoundOutlined />
                      </button>
                    )}
                    <HighlightedExample example={v.example} lemma={v.lemma} text={v.text} />
                  </div>
                )}
                {([1,2,3,4,5] as const).map(i => {
                  const val = (v as Record<string, unknown>)[`other_${i}`] as string | undefined;
                  if (!val) return null;
                  return (
                    <div key={i} className="text-sm text-(--text-main) leading-relaxed">
                      {val}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Footer: level dots + check/edit + delete */}
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-1.5">
          {v.level && (
            <span className="text-xs font-semibold text-(--text-main)">{v.level}</span>
          )}
          <LevelDots level={v.level} />
          {v.level && !readOnly && (
            <Tooltip title={CEFR_TOOLTIP} placement="top">
              <QuestionCircleOutlined
                onPointerDown={(e) => e.stopPropagation()}
                className="text-gray-400 cursor-default text-xs"
              />
            </Tooltip>
          )}
        </div>
        {!readOnly && (
          <div className="flex items-center gap-2">
            {isEditing ? (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); commitEdit(); }}
                className="cursor-pointer"
                aria-label="Save vocab"
              >
                <CheckOutlined style={{ color: '#52c41a', fontSize: '16px' }} />
              </button>
            ) : (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={enterEdit}
                className="cursor-pointer"
                aria-label="Edit vocab"
              >
                <EditTwoTone twoToneColor="#1677ff" />
              </button>
            )}
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
              className="cursor-pointer"
            >
              <DeleteTwoTone twoToneColor="#eb2f96" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VocabCards({ vocab, sentenceIdx, onDelete, onReorder, onEdit }: { vocab: VocabItem[]; sentenceIdx: number; onDelete?: (sentenceIdx: number, lemma: string, pos: string) => void; onReorder?: (sentenceIdx: number, newVocab: VocabItem[]) => void; onEdit?: (sentenceIdx: number, vocabItem: VocabItem) => void }): React.ReactElement | null {
  const items = useMemo(() => {
    const list = Array.isArray(vocab) ? vocab : [];
    return list.filter((v) =>
      [v.translation, v.definition, v.example, v.level, v.other_1, v.other_2, v.other_3, v.other_4, v.other_5].some(
        (value) => value != null && String(value).trim() !== ""
      )
    );
  }, [vocab]);

  const [order, setOrder] = useState<string[]>([]);

  const sortedItems = useMemo(() => {
    const itemMap = new Map(items.map((v) => [itemId(v), v]));
    const ordered = order.filter((id) => itemMap.has(id)).map((id) => itemMap.get(id));
    const added = items.filter((v) => !order.includes(itemId(v)));
    return [...ordered, ...added];
  }, [items, order]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sortedItems.findIndex((v) => itemId(v) === active.id);
    const newIndex = sortedItems.findIndex((v) => itemId(v) === over.id);
    const next = arrayMove(sortedItems, oldIndex, newIndex);
    setOrder(next.map(itemId));
    onReorder?.(sentenceIdx, next);
  }

  if (items.length === 0) return null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={sortedItems.map(itemId)} strategy={rectSortingStrategy}>
        <div className="mt-4 grid grid-cols-1 min-[480px]:grid-cols-2 gap-3">
          {sortedItems.map((v) => (
            <SortableVocabCard
              key={itemId(v)}
              id={itemId(v)}
              v={v}
              onDelete={() => onDelete?.(sentenceIdx, v.lemma, v.pos)}
              onEdit={(updates) => onEdit?.(sentenceIdx, { ...v, ...updates })}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
