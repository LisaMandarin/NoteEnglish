import { useState, type ReactElement } from "react";
import SentenceSkeleton from "./SentenceSkeleton";
import { CAT_COLOR_VAR, CAT_ZH, joinTokens } from "./syntaxConfig";
import sampleSyntax from "../../data/sampleSyntax";

// Standalone harness for ?view=syntax-demo: a sentence picker + legend + the
// skeleton-fold view, driven by sample spaCy parses. Doubles as living docs.
export default function SentenceStructureDemo(): ReactElement {
  const [selected, setSelected] = useState<number>(0);
  const current = sampleSyntax[selected];
  const sentenceText = joinTokens(current.tokens.map((t) => t.text));
  const legendCats = Object.keys(CAT_ZH) as (keyof typeof CAT_ZH)[];

  return (
    <div className="min-h-screen w-full px-6 py-10 sm:px-10">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-6">
          <p className="m-0 text-xs tracking-widest text-(--accent)">句句通 · 句構分析</p>
          <h1 className="m-0 mt-1 text-3xl">骨架摺疊</h1>
          <p className="mt-2 text-sm text-(--text-main) opacity-70">
            預設只顯示句子主幹，修飾成分收成虛線膠囊；點膠囊逐層展開，點 ✕ 收合。
          </p>
        </header>

        <div className="mb-4 flex flex-wrap gap-2">
          {sampleSyntax.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setSelected(i)}
              className={`cursor-pointer rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                i === selected
                  ? "border-(--accent) bg-(--card-bg) text-(--accent)"
                  : "border-(--card-border) bg-(--card-bg) text-(--text-main) hover:border-(--accent)"
              }`}
            >
              <span className="block text-xs opacity-60">句 {i + 1}</span>
              <span className="block">{s.feat}</span>
            </button>
          ))}
        </div>

        <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-(--card-border) bg-(--card-bg) px-4 py-3">
          {legendCats.map((c) => (
            <span key={c} className="inline-flex items-center gap-2 text-sm text-(--text-main) opacity-80">
              <i className="inline-block h-3 w-3 rounded" style={{ background: `var(${CAT_COLOR_VAR[c]})` }} />
              {CAT_ZH[c]}
            </span>
          ))}
        </div>

        <p className="mb-2 text-base text-(--text-main) opacity-70" style={{ fontFamily: "var(--font-heading)" }}>
          {sentenceText}
        </p>

        <div className="rounded-xl border border-(--card-border) bg-(--card-bg) p-5">
          <SentenceSkeleton key={selected} tokens={current.tokens} previewWords={3} />
        </div>
      </div>
    </div>
  );
}
