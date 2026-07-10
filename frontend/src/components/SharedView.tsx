import { useEffect, useState } from "react";
import { Button, Tooltip } from "antd";
import { message } from "../lib/feedback";
import { ArrowLeftOutlined, HeartFilled, HeartOutlined } from "@ant-design/icons";
import type { SharedSessionDetail } from "../types";
import { addFavorite, getSharedSession, removeFavorite } from "../lib/api";
import SentenceItem from "./Translations/SentenceItem";
import SummaryExportBar from "./Translations/SummaryExportBar";
import AppTitle from "./MainSection/AppTitle";

// Read-only view of a shared article (?shared={token}). Deliberately NOT
// wrapped in TranslationProvider: the provider auto-saves every mutation to
// the viewer's own sessions, so keeping shared data in local state means no
// save path exists at all — nothing here can write to anyone's session.
export default function SharedView({ token }: { token: string }): React.ReactElement {
  const [detail, setDetail] = useState<SharedSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [favBusy, setFavBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    getSharedSession(token)
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
        setFavorited(data.is_favorited);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  function goHome(): void {
    // Strip ?shared and reload: lands on the normal app with a fresh view state.
    window.location.href = window.location.pathname;
  }

  async function toggleFavorite(): Promise<void> {
    if (!detail || favBusy) return;
    setFavBusy(true);
    try {
      if (favorited) {
        await removeFavorite(detail.session.id);
        setFavorited(false);
        message.success("已從收藏移除");
      } else {
        await addFavorite(token);
        setFavorited(true);
        message.success("已加入收藏，可隨時從側邊欄的收藏清單開啟");
      }
    } catch {
      message.error("操作失敗，請稍後再試。");
    } finally {
      setFavBusy(false);
    }
  }

  const title = detail?.session.title?.trim() || "分享的學習紀錄";

  return (
    <div className="min-h-screen w-full px-6 pb-10 pt-8 sm:px-10">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <AppTitle title="句句通" className="flex items-center gap-2" />
          <Button icon={<ArrowLeftOutlined />} onClick={goHome}>
            回到我的學習紀錄
          </Button>
        </div>

        <div className="rounded-[30px] border-4 border-(--card-border) bg-(--card-bg) shadow-md">
          <div className="w-full m-0 box-border px-6 py-8 sm:px-12 sm:py-10">
            {loading && <p className="m-0 text-base text-black/70">正在載入分享的學習紀錄⋯⋯</p>}

            {!loading && error && (
              <div className="flex flex-col items-start gap-3">
                <p className="m-0 text-base text-black/80">
                  這個分享連結已失效，可能是作者取消分享或刪除了這篇學習紀錄。
                </p>
                <Button type="primary" onClick={goHome}>
                  回到我的學習紀錄
                </Button>
              </div>
            )}

            {!loading && !error && detail && (
              <>
                <p className="m-0 mb-1 text-sm font-semibold uppercase tracking-[0.24em] text-(--accent)">
                  分享的學習紀錄・唯讀
                </p>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="m-0 text-2xl leading-snug sm:text-3xl">{title}</h2>
                    <p className="m-0 mt-1 text-sm text-black/60">
                      由 {detail.creator_name?.trim() || "使用者"} 分享
                    </p>
                  </div>
                  <Tooltip title={favorited ? "從收藏清單移除" : "收藏後可隨時開啟"}>
                    <Button
                      type={favorited ? "primary" : "default"}
                      icon={favorited ? <HeartFilled /> : <HeartOutlined />}
                      loading={favBusy}
                      onClick={toggleFavorite}
                    >
                      {favorited ? "已收藏" : "收藏"}
                    </Button>
                  </Tooltip>
                </div>

                <div className="mt-8">
                  <ol className="list-decimal space-y-8">
                    {detail.sentences.map((s, idx) => (
                      <SentenceItem key={idx} sentence={s} idx={idx} readOnly />
                    ))}
                  </ol>
                  {detail.sentences.length === 0 && (
                    <p className="m-0 text-base text-black/60">這篇學習紀錄目前沒有內容。</p>
                  )}
                  <SummaryExportBar sentences={detail.sentences} sessionTitle={title} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
