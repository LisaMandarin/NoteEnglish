import { useMemo } from "react";
import { Button } from "antd";
import type { VocabItem } from "../types";

type VocabPrintData = {
  sessionTitle?: string;
  vocab: VocabItem[];
};

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

function highlightWord(example: string, word: string): React.ReactElement {
  if (!word) return <>{example}</>;
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = example.split(new RegExp(`(${escaped})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === word.toLowerCase()
          ? <strong key={i}>{part}</strong>
          : <span key={i}>{part}</span>
      )}
    </>
  );
}

function PrintVocabCard({ v }: { v: VocabItem }): React.ReactElement {
  const head = (v.lemma ?? v.text ?? "").trim();
  const posLabel = v.pos ? (POS_LABELS[v.pos] ?? v.pos) : null;

  return (
    <div className="vocab-print-card">
      <div className="vpc-header">
        <span className="vpc-word">{head}</span>
        {v.pos && (
          <span className="vpc-pos" title={posLabel ?? undefined}>{v.pos}</span>
        )}
        {v.level && (
          <span className="vpc-level">{v.level}</span>
        )}
      </div>
      {v.translation && (
        <div className="vpc-translation">{v.translation}</div>
      )}
      {v.definition && (
        <div className="vpc-definition">{v.definition}</div>
      )}
      {v.example && (
        <div className="vpc-example">
          {highlightWord(v.example, v.text || v.lemma || "")}
        </div>
      )}
    </div>
  );
}

function readVocabPrintData(): VocabPrintData | null {
  const raw = localStorage.getItem("latestVocabPrint");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as VocabPrintData;
  } catch {
    return null;
  }
}

const CARDS_PER_PAGE = 12;

export default function VocabPrintWindow(): React.ReactElement {
  const data = useMemo(() => readVocabPrintData(), []);

  const pages = useMemo(() => {
    if (!data?.vocab?.length) return [];
    const result: VocabItem[][] = [];
    for (let i = 0; i < data.vocab.length; i += CARDS_PER_PAGE) {
      result.push(data.vocab.slice(i, i + CARDS_PER_PAGE));
    }
    return result;
  }, [data]);

  if (!data) {
    return (
      <div style={{ padding: 40 }}>
        找不到單字資料，請回主頁重新按「列印單字卡」。
      </div>
    );
  }

  return (
    <div className="vocab-print-root">
      <div className="vocab-print-toolbar no-print">
        <Button type="primary" onClick={() => window.print()}>
          列印 / Print
        </Button>
        <span className="vpc-title">{data.sessionTitle ?? "單字卡"}</span>
      </div>

      {pages.length === 0 ? (
        <div style={{ padding: 40 }}>目前沒有可列印的單字。</div>
      ) : (
        pages.map((page, pi) => (
          <div key={pi} className="vocab-print-page">
            {page.map((v, ci) => (
              <PrintVocabCard key={`${pi}-${ci}-${v.lemma ?? v.text}`} v={v} />
            ))}
          </div>
        ))
      )}
    </div>
  );
}
