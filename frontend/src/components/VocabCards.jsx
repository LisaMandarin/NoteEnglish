import { useMemo, useState } from "react";
import { DeleteTwoTone, HolderOutlined } from '@ant-design/icons';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/**
 * props:
 * - vocab: Array of vocab items
 *
 * vocabItem example:
 * {
 *  text, lemma, pos, translation?, definition?, example? level?
 * }
 */
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

  const [open, setOpen] = useState(true);
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
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-xl border border-(--card-border) bg-(--card-bg) px-3 py-2 text-sm text-(--text-main) shadow-sm hover:shadow"
      >
        <span className="font-semibold">單字筆記</span>
        <span className="text-xs opacity-70">({sortedItems.length})</span>
        <span className="ml-1 text-xs opacity-70 cursor-pointer">
          {open ? "收合" : "展開"}
        </span>
      </button>

      {open && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={sortedItems.map(itemId)}
            strategy={verticalListSortingStrategy}
          >
            <div className="mt-3 space-y-2">
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
      )}
    </div>
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
      <VocabCard v={v} onDelete={onDelete} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

function VocabCard({ v, onDelete, dragHandleProps }) {
  const head = `${v.lemma ?? v.text ?? ""}`.trim();

  const rows = [
    ["中文", v.translation],
    ["定義", v.definition],
    ["例句", v.example],
    ["程度", v.level],
  ].filter(([, val]) => val != null && String(val).trim() !== "");

  return (
    <div className="rounded-2xl border border-(--card-border) bg-(--card-bg) p-3 shadow-sm">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        {/* Left: drag handle + head + pos */}
        <div className="flex items-center gap-2 min-w-0">
          <span
            {...dragHandleProps}
            className="shrink-0 cursor-grab active:cursor-grabbing text-(--text-main) opacity-40 hover:opacity-70 touch-none"
          >
            <HolderOutlined />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="text-sm font-semibold text-(--text-main) truncate">
                {head || "vocab"}
              </div>
              <span className="shrink-0 rounded-full border border-(--card-border) px-2 py-0.5 text-xs opacity-70">
                {v.pos ?? "unknown"}
              </span>
            </div>

            {v.text &&
              v.lemma &&
              v.text.toLowerCase() !== v.lemma.toLowerCase() && (
                <div className="mt-1 text-xs opacity-70">
                  選取：<span className="font-medium">{v.text}</span>
                </div>
              )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {v.queried === true && (
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onMouseUp={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.();
              }}
              className="cursor-pointer"
            >
              <DeleteTwoTone twoToneColor="#eb2f96" />
            </button>
          )}
        </div>
      </div>

      {rows.length > 0 ? (
        <div className="mt-3 space-y-2">
          {rows.map(([label, val]) => (
            <div key={label} className="text-sm">
              <span className="mr-2 inline-block w-10 shrink-0 text-xs font-semibold opacity-70">
                {label}
              </span>
              <span className="text-(--text-main)">{val}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 text-xs opacity-70">
          (目前沒有回傳可顯示的欄位)
        </div>
      )}
    </div>
  );
}
