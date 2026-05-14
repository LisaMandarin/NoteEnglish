import { useMemo, useState } from "react";
import { DeleteTwoTone, QuestionCircleOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const CEFR_TOOLTIP = (
  <div className="text-xs leading-relaxed space-y-0.5">
    <div><strong>CEFR Levels</strong></div>
    <div>A1 · A2 — Beginner</div>
    <div>B1 · B2 — Intermediate</div>
    <div>C1 · C2 — Advanced</div>
  </div>
);

export default function VocabCards({ vocab, sentenceIdx, onDelete, onReorder }) {
  const items = useMemo(() => {
    const list = Array.isArray(vocab) ? vocab : [];
    return list.filter((v) => {
      if (v?.queried !== true) return false;
      return [v.translation, v.definition, v.example, v.level].some(
        (value) => value != null && String(value).trim() !== ""
      );
    });
  }, [vocab]);

  const [order, setOrder] = useState([]);

  const sortedItems = useMemo(() => {
    const itemMap = new Map(items.map((v) => [itemId(v), v]));
    const ordered = order.filter((id) => itemMap.has(id)).map((id) => itemMap.get(id));
    const added = items.filter((v) => !order.includes(itemId(v)));
    return [...ordered, ...added];
  }, [items, order]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function handleDragEnd(event) {
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
        <div className="mt-4 grid grid-cols-2 gap-3">
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

function itemId(v) {
  return `${v.lemma ?? v.text}-${v.pos ?? "unknown"}`;
}

function SortableVocabCard({ id, v, onDelete }) {
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

function VocabCard({ v, onDelete, dragProps }) {
  const head = (v.lemma ?? v.text ?? "").trim();
  const hasContent = v.definition || v.example;

  return (
    <div
      {...dragProps}
      className="rounded-2xl border border-(--card-border) bg-(--card-bg) p-4 shadow-sm flex flex-col cursor-grab active:cursor-grabbing select-none"
    >
      {/* Word + POS badge */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg font-bold text-(--text-main)">{head || "vocab"}</span>
        <span className={`rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${getPosStyle(v.pos)}`}>
          {v.pos ?? "—"}
        </span>
      </div>

      {/* Chinese translation */}
      {v.translation && (
        <div className="text-2xl font-bold text-(--text-main) mb-2">{v.translation}</div>
      )}

      {/* Definition + Example or placeholder */}
      <div className="flex-1">
        {hasContent ? (
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
        ) : (
          <p className="text-sm opacity-40 italic">尚未補充定義與例句</p>
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
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
          className="cursor-pointer"
        >
          <DeleteTwoTone twoToneColor="#eb2f96" />
        </button>
      </div>
    </div>
  );
}

function HighlightedExample({ example, lemma, text }) {
  const word = text || lemma || "";
  if (!word || !example) return <span>{example}</span>;

  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = example.split(new RegExp(`(${escaped})`, "gi"));

  return (
    <span>
      {parts.map((part, i) =>
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

function LevelDots({ level }) {
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

const LEVEL_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];

function getLevelInfo(level) {
  const idx = LEVEL_ORDER.indexOf((level ?? "").toUpperCase());
  if (idx === -1) return { filled: 0, total: 6, color: "bg-gray-400" };
  const color = idx < 2 ? "bg-green-500" : idx < 4 ? "bg-amber-500" : "bg-red-500";
  return { filled: idx + 1, total: 6, color };
}

function getPosStyle(_pos?: string) {
  return "bg-(--accent)/15 text-(--accent)";
}
