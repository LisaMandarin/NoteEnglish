import { useMemo, useState } from "react";

/**
 * props:
 * - vocab: Array of vocab items
 *
 * vocabItem example:
 * {
 *  text, lemma, pos, translation?, definition?, example? level?
 * }
 */
export default function VocabCards({ vocab }) {
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
        <span className="ml-1 text-xs opacity-70">
          {open ? "收合" : "展開"}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {items.map((v, i) => (
            <VocabCard
              key={`${v.lemma ?? v.text}-${v.pos ?? "unknown"}-${i}`}
              v={v}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VocabCard({ v }) {
  const head = `${v.lemma ?? v.text ?? ""}${v.pos ? ` • ${v.pos}` : ""}`.trim();

  const rows = [
    ["中文", v.translation],
    ["定義", v.definition],
    ["例句", v.example],
    ["程度", v.level],
  ].filter(([, val]) => val != null && String(val).trim() !== "");

  return (
    <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[var(--text-main)]">
            {head || "vocab"}
          </div>
          {v.text &&
            v.lemma &&
            v.text.toLowerCase() !== v.lemma.toLowerCase() && (
              <div className="mt-1 text-xs opacity-70">
                選取：<span className="font-medium">{v.text}</span>
              </div>
            )}
        </div>

        <span className="shrink-0 rounded-full border border-[var(--card-border)] px-2 py-0.5 text-xs opacity-70">
          {v.pos ?? "unknown"}
        </span>
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
