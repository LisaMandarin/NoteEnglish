import { useMemo, useState } from "react";
import { DeleteTwoTone } from '@ant-design/icons';

/**
 * props:
 * - vocab: Array of vocab items
 *
 * vocabItem example:
 * {
 *  text, lemma, pos, translation?, definition?, example? level?
 * }
 */
export default function VocabCards({ vocab, sentenceIdx, onDelete }) {
  const items = useMemo(() => {
    const list = Array.isArray(vocab) ? vocab : [];
    return list.filter((v) => v?.queried === true);
  }, [vocab]);
  const [open, setOpen] = useState(true);

  if (items.length === 0) return null;

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2 text-sm text-[var(--text-main)] shadow-sm hover:shadow"
      >
        <span className="font-semibold">單字筆記</span>
        <span className="text-xs opacity-70">({items.length})</span>
        <span className="ml-1 text-xs opacity-70 cursor-pointer">
          {open ? "收合" : "展開"}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {items.map((v, i) => (
            <VocabCard
              key={`${v.lemma ?? v.text}-${v.pos ?? "unknown"}-${i}`}
              v={v}
              onDelete={() => onDelete?.(sentenceIdx, v.lemma, v.pos)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VocabCard({ v, onDelete }) {
  const head = `${v.lemma ?? v.text ?? ""}`.trim();

  const rows = [
    ["中文", v.translation],
    ["定義", v.definition],
    ["例句", v.example],
    ["程度", v.level],
  ].filter(([, val]) => val != null && String(val).trim() !== "");

  return (
    <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-3 shadow-sm">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        {/* Left: head + pos inline */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="text-sm font-semibold text-[var(--text-main)] truncate">
              {head || "vocab"}
            </div>
            <span className="shrink-0 rounded-full border border-[var(--card-border)] px-2 py-0.5 text-xs opacity-70">
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
              <span className="text-[var(--text-main)]">{val}</span>
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
