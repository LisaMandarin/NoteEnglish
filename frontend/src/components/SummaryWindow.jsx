import { useEffect, useMemo } from "react";
import { Typography } from "antd";

const { Text } = Typography;

function readSummaryData() {
  const params = new URLSearchParams(window.location.search);
  const key = params.get("summaryKey");
  if (!key) return null;

  const raw = localStorage.getItem(`summary:${key}`);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default function SummaryWindow() {
  const data = useMemo(() => readSummaryData(), []);
  const subtitle = useMemo(() => {
    if (!data) return "請回主頁重新產生彙整資料";

    const parts = ["原文"];
    if (data.includeTranslation) parts.push("翻譯");
    if (data.includeVocab) parts.push("單字筆記");
    return `內容：${parts.join(" + ")}`;
  }, [data]);

  useEffect(() => {
    if (!data) {
      document.title = "NoteEnglish | 彙整結果 | 資料不存在";
      return;
    }
    document.title = `NoteEnglish | 彙整結果 | ${subtitle}`;
  }, [data, subtitle]);

  if (!data) {
    return (
      <div className="min-h-screen w-full px-6 py-10 sm:px-10">
        <div className="rounded-[30px] bg-(--card-bg) shadow-md border-4 border-(--card-border)">
          <div className="w-full m-0 px-12 py-10 box-border">
            <h1 className="text-2xl font-bold mb-3">彙整結果</h1>
            <div className="mb-3 text-sm opacity-80">{subtitle}</div>
            <Text type="secondary">找不到彙整資料，請回主頁重新按一次「彙整」。</Text>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full px-6 py-10 sm:px-10">
      <div className="rounded-[30px] bg-(--card-bg) shadow-md border-4 border-(--card-border)">
        <div className="w-full m-0 px-12 py-10 box-border">
          <h1 className="text-2xl font-bold mb-2">彙整結果</h1>
          <div className="mb-6 text-sm opacity-80">{subtitle}</div>

          {data.rows?.length ? (
            <div className="space-y-6">
              {data.rows.map((row) => (
                <section
                  key={row.idx}
                  className="rounded-2xl border border-(--card-border) bg-(--card-bg) p-4"
                >
                  <div className="space-y-1">
                    <div>
                      <span className="font-semibold">{row.idx + 1}. 原文:</span> {row.original}
                    </div>
                    {data.includeTranslation && (
                      <div>
                        <span className="font-semibold">Translation:</span> {row.translation}
                      </div>
                    )}
                  </div>

                  {data.includeVocab && (
                    <div className={data.includeTranslation ? "mt-3" : "mt-2"}>
                      <div className="font-semibold">單字筆記:</div>
                      {row.vocab?.length ? (
                        <div className="mt-2 space-y-2">
                          {row.vocab.map((v, i) => (
                            <article
                              key={`${row.idx}-${v.lemma ?? v.text ?? "vocab"}-${v.pos ?? "unknown"}-${i}`}
                              className="rounded-xl border border-(--card-border) bg-(--card-bg) p-3"
                            >
                              <div>
                                <span className="font-semibold">{v.lemma ?? v.text ?? "vocab"}</span> ({v.pos ?? "unknown"})
                              </div>
                              {v.text &&
                                v.lemma &&
                                v.text.toLowerCase() !== v.lemma.toLowerCase() && (
                                  <div className="mt-1 text-sm opacity-80">選取：{v.text}</div>
                                )}

                              {[
                                ["中文", v.translation],
                                ["定義", v.definition],
                                ["例句", v.example],
                                ["程度", v.level],
                              ]
                                .filter(([, val]) => val != null && String(val).trim() !== "")
                                .map(([label, val]) => (
                                  <div key={label} className="mt-1 text-sm">
                                    <span className="font-semibold">{label}：</span>
                                    <span>{val}</span>
                                  </div>
                                ))}

                              {![v.translation, v.definition, v.example, v.level].some(
                                (val) => val != null && String(val).trim() !== "",
                              ) && (
                                <div className="mt-1 text-sm opacity-70">(目前沒有回傳可顯示的欄位)</div>
                              )}
                            </article>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-2 text-sm opacity-70">(目前沒有單字筆記)</div>
                      )}
                    </div>
                  )}
                </section>
              ))}
            </div>
          ) : (
            <Text type="secondary">目前沒有可彙整的內容。</Text>
          )}
        </div>
      </div>
    </div>
  );
}
