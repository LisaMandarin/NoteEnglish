import { useMemo, useState } from "react";
import type { VocabItem } from "../types";
import { DeleteTwoTone, QuestionCircleOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
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
          <mark key={i} className="bg-purple-100 text-purple-700 rounded px-0.5 not-italic">
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
  const { filled, total, color } = getLevelInfo(level);
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`inline-block w-2.5 h-2.5 rounded-full ${
            i < filled ? color : "border border-gray-300 bg-transparent"
          }`}
        />
      ))}
    </div>
  );
}

function SortableVocabCard({ id, v, onDelete }: { id: string; v: VocabItem; onDelete?: () => void }) {
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
      <VocabCard v={v} onDelete={onDelete} dragProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

// ── Exported components ───────────────────────────────────────────────────────

export function VocabCard({ v, onDelete, dragProps, readOnly = false }: { v: VocabItem; onDelete?: () => void; dragProps?: object; readOnly?: boolean }) {
  const head = (v.lemma ?? v.text ?? "").trim();
  const hasContent = v.definition || v.example;

  return (
    <div
      {...(!readOnly ? dragProps : {})}
      className={`rounded-2xl border border-(--card-border) bg-(--card-bg) p-4 shadow-sm flex flex-col select-none min-h-50 min-w-0 ${readOnly ? "" : "cursor-grab active:cursor-grabbing"}`}
    >
      {/* Word + POS badge */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg font-bold text-(--text-main)">{head || "vocab"}</span>
        <Tooltip title={v.pos ? POS_LABELS[v.pos] : undefined}>
          <span className={`rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${getPosStyle(v.pos)}`}>
            {v.pos ?? "—"}
          </span>
        </Tooltip>
      </div>

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
              <div className="rounded-lg bg-gray-100 px-3 py-2 text-sm">
                <HighlightedExample example={v.example} lemma={v.lemma} text={v.text} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer: level dots + delete */}
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-1.5">
          {v.level && (
            <span className="text-xs font-semibold text-(--text-main)">{v.level}</span>
          )}
          <LevelDots level={v.level} />
          <Tooltip title={CEFR_TOOLTIP} placement="top">
            <QuestionCircleOutlined
              onPointerDown={(e) => e.stopPropagation()}
              className="text-gray-400 cursor-default text-xs"
            />
          </Tooltip>
        </div>
        {!readOnly && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
            className="cursor-pointer"
          >
            <DeleteTwoTone twoToneColor="#eb2f96" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function VocabCards({ vocab, sentenceIdx, onDelete, onReorder }: { vocab: VocabItem[]; sentenceIdx: number; onDelete?: (sentenceIdx: number, lemma: string, pos: string) => void; onReorder?: (sentenceIdx: number, newVocab: VocabItem[]) => void }): React.ReactElement | null {
  const items = useMemo(() => {
    const list = Array.isArray(vocab) ? vocab : [];
    return list.filter((v) =>
      [v.translation, v.definition, v.example, v.level].some(
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
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
