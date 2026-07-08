import { useEffect, useState } from "react";
import {
  ArrowRightOutlined,
  PlusOutlined,
  ReadOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { useTranslation } from "../../context/translationContext";
import { getReviewWords, listSessions } from "../../lib/api";
import { formatUpdatedAt } from "../../lib/formatUpdatedAt";
import type { SessionRecord } from "../../types";

const RECENT_SESSION_LIMIT = 5;

export default function HomeDashboard({
  username,
  onShowTranslate,
  onStartReview,
}: {
  username: string;
  onShowTranslate: () => void;
  onStartReview: () => void;
}): React.ReactElement {
  const {
    state: { sessionLoading },
    actions: { clear, loadSession },
  } = useTranslation();
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [openingSessionId, setOpeningSessionId] = useState<string | null>(null);
  // Words due for spaced-repetition review; null while loading/on failure.
  const [dueCount, setDueCount] = useState<number | null>(null);

  async function loadRecentSessions(): Promise<void> {
    setHistoryLoading(true);
    setHistoryError("");

    try {
      const page = await listSessions(RECENT_SESSION_LIMIT, 0);
      setSessions(page.items);
    } catch {
      setHistoryError("目前無法載入歷史學習紀錄，請稍後再試。");
      setSessions([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    void loadRecentSessions();
    let mounted = true;
    getReviewWords()
      .then((items) => {
        if (mounted) setDueCount(items.length);
      })
      .catch(() => {
        // The review card simply stays hidden when the count can't load.
      });
    return () => {
      mounted = false;
    };
  }, []);

  function handleNewSession(): void {
    clear();
    onShowTranslate();
  }

  async function handleOpenSession(sessionId: string): Promise<void> {
    setOpeningSessionId(sessionId);
    const loaded = await loadSession(sessionId);
    setOpeningSessionId(null);

    if (loaded) {
      onShowTranslate();
      return;
    }

    setHistoryError("目前無法開啟這筆學習紀錄，請再試一次。");
  }

  return (
    <main className="relative overflow-hidden rounded-[30px] border-4 border-(--card-border) bg-(--card-bg) shadow-md">
      {sessionLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[26px] bg-white/65 backdrop-blur-sm">
          <p className="m-0 text-sm font-medium text-black/55">正在開啟學習紀錄⋯⋯</p>
        </div>
      )}

      <div className="px-6 py-8 sm:px-10 sm:py-10 xl:px-12">
        <header className="max-w-3xl">
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.24em] text-(--accent)">
            歡迎回來，{username}
          </p>
          <h1 className="m-0 text-4xl leading-tight sm:text-5xl">
            今天想怎麼學英文？
          </h1>
          <p className="mb-0 mt-4 max-w-2xl text-base leading-7 text-black/65">
            開始新的英文閱讀學習，或從最近的學習紀錄接續上次的進度。
          </p>
        </header>

        <section aria-labelledby="new-session-heading" className="mt-8">
          <button
            type="button"
            onClick={handleNewSession}
            className="group flex w-full cursor-pointer items-center gap-5 rounded-[28px] border-2 border-(--card-border) bg-(--card-border) px-6 py-6 text-left text-white shadow-sm transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--card-border) sm:px-8"
          >
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-2xl text-(--card-border)">
              <PlusOutlined aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span
                id="new-session-heading"
                className="block [font-family:var(--font-heading)] text-2xl font-semibold text-white"
              >
                開始新的學習紀錄
              </span>
              <span className="mt-1 block text-sm leading-6 text-white sm:text-base">
                貼上英文文章或上傳圖片轉成文字，再逐句翻譯與學習。
              </span>
            </span>
            <ArrowRightOutlined
              aria-hidden="true"
              className="shrink-0 transition-transform duration-200 group-hover:translate-x-1"
            />
          </button>
        </section>

        {dueCount != null && dueCount > 0 && (
          <section aria-labelledby="review-heading" className="mt-5">
            <button
              type="button"
              onClick={onStartReview}
              className="group flex w-full cursor-pointer items-center gap-5 rounded-[28px] border-2 border-(--accent) bg-[color-mix(in_srgb,var(--accent)_10%,white)] px-6 py-5 text-left shadow-sm transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--accent) sm:px-8"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-(--accent) text-xl text-white">
                <ThunderboltOutlined aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  id="review-heading"
                  className="block [font-family:var(--font-heading)] text-xl font-semibold text-(--text-main)"
                >
                  今日複習
                </span>
                <span className="mt-0.5 block text-sm leading-6 text-black/65">
                  有 {dueCount} 個單字到期了，花幾分鐘複習一下吧！
                </span>
              </span>
              <ArrowRightOutlined
                aria-hidden="true"
                className="shrink-0 text-(--accent) transition-transform duration-200 group-hover:translate-x-1"
              />
            </button>
          </section>
        )}

        <section
          id="recent-sessions"
          aria-labelledby="recent-sessions-heading"
          className="mt-9"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="m-0 text-xs font-semibold uppercase tracking-[0.2em] text-(--accent)">
                歷史學習紀錄
              </p>
              <h2 id="recent-sessions-heading" className="mb-0 mt-1 text-2xl">
                最近的學習紀錄
              </h2>
            </div>
            <button
              type="button"
              onClick={() => void loadRecentSessions()}
              disabled={historyLoading}
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-black/10 bg-white/70 text-(--accent) transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45"
              aria-label="重新整理最近的學習紀錄"
            >
              <ReloadOutlined spin={historyLoading} aria-hidden="true" />
            </button>
          </div>

          <div className="overflow-hidden rounded-3xl border border-black/10 bg-white/55">
            {historyLoading && (
              <div className="space-y-3 p-5" aria-label="正在載入最近的學習紀錄">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="h-14 animate-pulse rounded-2xl bg-black/5" />
                ))}
              </div>
            )}

            {!historyLoading && historyError && (
              <div className="px-5 py-7 text-center">
                <p className="m-0 text-sm text-red-700">{historyError}</p>
                <button
                  type="button"
                  onClick={() => void loadRecentSessions()}
                  className="mt-3 cursor-pointer rounded-full border border-(--card-border) bg-transparent px-4 py-2 text-sm font-semibold text-(--accent)"
                >
                  再試一次
                </button>
              </div>
            )}

            {!historyLoading && !historyError && sessions.length === 0 && (
              <div className="px-5 py-8 text-center">
                <p className="m-0 text-base font-semibold text-(--text-main)">
                  目前還沒有學習紀錄
                </p>
                <p className="mb-0 mt-1 text-sm text-black/55">
                  完成文章翻譯後，學習紀錄會自動顯示在這裡。
                </p>
                <button
                  type="button"
                  onClick={handleNewSession}
                  className="mt-4 cursor-pointer rounded-full border-0 bg-(--accent) px-5 py-2.5 text-sm font-semibold text-white"
                >
                  開始第一筆學習紀錄
                </button>
              </div>
            )}

            {!historyLoading && !historyError && sessions.length > 0 && (
              <div className="divide-y divide-black/8">
                {sessions.map((session) => {
                  const title =
                    session.title?.trim() ||
                    session.source_text?.trim().slice(0, 80) ||
                    "尚未命名的學習紀錄";
                  const preview = session.source_text?.trim();
                  const isOpening = openingSessionId === session.id;

                  return (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => void handleOpenSession(session.id)}
                      disabled={sessionLoading}
                      className="group flex w-full cursor-pointer items-center gap-4 border-0 bg-transparent px-5 py-4 text-left transition-colors hover:bg-white/80 disabled:cursor-wait sm:px-6"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--accent)_12%,white)] text-(--accent)">
                        <ReadOutlined aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-semibold text-(--text-main)">
                          {title}
                        </span>
                        <span className="mt-0.5 block truncate text-sm text-black/50">
                          {isOpening
                            ? "正在開啟學習紀錄⋯⋯"
                            : preview || formatUpdatedAt(session.updated_at)}
                        </span>
                      </span>
                      {typeof session.proficiency === "number" && (
                        <span className="shrink-0 rounded-full bg-(--accent)/12 px-2 py-0.5 text-xs font-semibold text-(--accent)">
                          熟練度 {session.proficiency}%
                        </span>
                      )}
                      <span className="hidden shrink-0 text-xs font-medium text-black/45 sm:block">
                        {formatUpdatedAt(session.updated_at)}
                      </span>
                      <ArrowRightOutlined
                        aria-hidden="true"
                        className="shrink-0 text-black/35 transition-transform duration-200 group-hover:translate-x-1"
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
