import { useEffect, useMemo } from "react";
import { Button, Typography } from "antd";
import type { VocabItem } from "../types";
import { VocabCard } from "./Vocab/VocabCards";

const { Text } = Typography;

type SummaryRow = {
  idx: number;
  original: string;
  translation: string;
  note?: string;
  vocab: VocabItem[];
};

type SummaryData = {
  createdAt: number;
  sessionTitle?: string;
  includeTranslation: boolean;
  includeVocab: boolean;
  includeNote?: boolean;
  rows: SummaryRow[];
};

function readSummaryData(): SummaryData | null {
  const raw = localStorage.getItem("latestSummary");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SummaryData;
  } catch {
    return null;
  }
}

export default function SummaryWindow() {
  const data = useMemo(() => readSummaryData(), []);
  const subtitle = useMemo(() => {
    if (!data) return "";
    const parts = ["原文"];
    if (data.includeTranslation) parts.push("翻譯");
    if (data.includeVocab) parts.push("單字筆記");
    if (data.includeNote) parts.push("自訂筆記");
    return parts.join(" + ");
  }, [data]);

  useEffect(() => {
    if (!data) {
      document.title = "句句通 | 彙整結果 | 資料不存在";
      return;
    }
    document.title = data.sessionTitle?.trim().slice(0, 25) || "句句通 彙整結果";
  }, [data]);

  if (!data) {
    return (
      <div className="summary-print-root">
        <div className="summary-print-toolbar no-print">
          <span className="spt-title">彙整結果</span>
        </div>
        <div className="summary-print-page">
          <Text type="secondary">找不到彙整資料，請回主頁重新按一次「彙整」。</Text>
        </div>
      </div>
    );
  }

  return (
    <div className="summary-print-root">
      <div className="summary-print-toolbar no-print">
        <Button type="primary" onClick={() => window.print()}>
          列印 / 存成PDF
        </Button>
        <span className="spt-title">{data.sessionTitle ?? "彙整結果"}</span>
        <span className="spt-subtitle">{subtitle}</span>
      </div>

      <div className="summary-print-page">
        {data.rows?.length ? (
          <div className="divide-y divide-dashed divide-[#aaa]">
            {data.rows.map((row) => (
              <section key={row.idx} className="py-6 flex gap-4">
                <div className="spp-num">
                  {row.idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="space-y-1">
                    <div>
                      <span className="font-semibold">原文:</span>{" "}
                      <span style={{ whiteSpace: "pre-wrap" }}>{row.original}</span>
                    </div>
                    {data.includeTranslation && (
                      <div className="space-y-1 mt-1" style={{ whiteSpace: "pre-wrap" }}>
                        {(row.translation ?? "")
                          .split(/(?<=。)|(?<=\. )/)
                          .map((s: string) => s.trim())
                          .filter(Boolean)
                          .map((sentence: string, i: number) => (
                            <div key={i}>{sentence}</div>
                          ))}
                      </div>
                    )}
                  </div>

                  {data.includeNote && (row.note ?? "").trim() && (
                    <div className="mt-3">
                      <div className="font-semibold">自訂筆記:</div>
                      <div className="mt-1" style={{ whiteSpace: "pre-wrap" }}>
                        {row.note}
                      </div>
                    </div>
                  )}

                  {data.includeVocab &&
                    (() => {
                      const vocabItems = (row.vocab ?? []).filter(
                        (v: VocabItem) =>
                          [v.translation, v.definition, v.example, v.level].some(
                            (val) => val != null && String(val).trim() !== ""
                          )
                      );
                      return (
                        <div className={data.includeTranslation ? "mt-3" : "mt-2"}>
                          <div className="font-semibold">單字筆記:</div>
                          {vocabItems.length ? (
                            <div className="mt-2 grid grid-cols-1 min-[480px]:grid-cols-2 gap-3">
                              {vocabItems.map((v, i) => (
                                <VocabCard
                                  key={`${row.idx}-${v.lemma ?? v.text ?? "vocab"}-${v.pos ?? "unknown"}-${i}`}
                                  v={v}
                                  readOnly
                                />
                              ))}
                            </div>
                          ) : (
                            <div className="mt-2 text-sm opacity-70">(目前沒有單字筆記)</div>
                          )}
                        </div>
                      );
                    })()}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <Text type="secondary">目前沒有可彙整的內容。</Text>
        )}
      </div>
    </div>
  );
}
