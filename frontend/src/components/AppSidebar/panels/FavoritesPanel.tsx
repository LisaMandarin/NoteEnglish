import { useEffect, useState } from "react";
import { HeartFilled, ReloadOutlined } from "@ant-design/icons";
import { Tooltip } from "antd";
import type { FavoriteItem } from "../../../types";
import { listFavorites } from "../../../lib/api";
import { formatUpdatedAt } from "../../../lib/formatUpdatedAt";

// Favorited shared articles. The backend already filters out deleted (cascade)
// and unshared (revoked token) sessions, so whatever arrives here is openable.
export default function FavoritesPanel({ activePanel }: { activePanel: string }): React.ReactElement {
  const [items, setItems] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const res = await listFavorites();
      setItems(res.items ?? []);
    } catch {
      setError("無法載入收藏清單，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (activePanel === "favorites") load();
  }, [activePanel]);

  function openShared(token: string): void {
    // Full navigation into the read-only view — same entry as a shared link.
    window.location.href = `${window.location.pathname}?shared=${token}`;
  }

  return (
    <>
      <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-(--accent)">
        收藏
      </p>
      <h2 className="mb-4 text-3xl leading-tight">收藏的分享學習紀錄</h2>
      <p className="m-0 text-base text-black/70">
        點按可隨時開啟別人分享給你的學習紀錄（唯讀）。
      </p>
      <div className="mt-6 rounded-3xl border border-black/10 bg-white/70 p-4">
        <div className="flex items-center justify-between">
          <p className="m-0 text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
            你的收藏
          </p>
          <Tooltip title="重新整理">
            <button
              onClick={load}
              disabled={loading}
              className="flex h-6 w-6 items-center justify-center rounded-full border-0 bg-transparent text-black/40 transition-colors hover:bg-black/8 hover:text-black/70 hover:cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ReloadOutlined spin={loading} />
            </button>
          </Tooltip>
        </div>
        {loading && (
          <p className="mt-3 m-0 text-sm text-black/70">正在載入收藏清單⋯⋯</p>
        )}
        {error && <p className="mt-3 m-0 text-sm text-red-600">{error}</p>}
        {!loading && !error && items.length === 0 && (
          <p className="mt-3 m-0 text-sm text-black/70">
            還沒有收藏。開啟別人分享的學習紀錄後按「收藏」，就會出現在這裡。
          </p>
        )}
        {!loading && !error && items.length > 0 && (
          <div className="mt-3 space-y-3">
            {items.map((item) => (
              <button
                key={item.session_id}
                type="button"
                onClick={() => openShared(item.share_token)}
                className="group w-full cursor-pointer rounded-2xl border p-3 text-left transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-black/20 hover:bg-white"
                style={{
                  borderColor: "rgb(0 0 0 / 0.08)",
                  backgroundColor: "rgb(255 255 255 / 0.78)",
                }}
              >
                <p className="m-0 flex items-center gap-1.5 text-base font-semibold text-black/85">
                  <HeartFilled className="shrink-0 text-(--accent)" style={{ fontSize: 12 }} />
                  <span className="min-w-0 truncate">{item.title}</span>
                </p>
                <p className="m-0 mt-0.5 text-xs leading-tight text-black/55">
                  由 {item.creator_name?.trim() || "使用者"} 分享・收藏於{" "}
                  {formatUpdatedAt(item.favorited_at)}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
