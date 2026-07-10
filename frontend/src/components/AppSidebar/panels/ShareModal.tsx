import { useEffect, useState } from "react";
import { Button, Input, Modal, Popconfirm } from "antd";
import { CopyOutlined, LinkOutlined } from "@ant-design/icons";
import { createShareLink, revokeShareLink } from "../../../lib/api";
import { copyToClipboard } from "../../../lib/clipboard";
import { message } from "../../../lib/feedback";

// Opening the modal generates (or fetches — the endpoint is idempotent) the
// share link right away: clicking 分享 already expresses the intent to share,
// and 取消分享 is one click away if it was a misclick.
export default function ShareModal({
  sessionId,
  open,
  onClose,
  onTokenChange,
}: {
  sessionId: string | null;
  open: boolean;
  onClose: () => void;
  onTokenChange: (sessionId: string, token: string | null) => void;
}): React.ReactElement {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !sessionId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setToken(null);
    createShareLink(sessionId)
      .then((res) => {
        if (cancelled) return;
        setToken(res.share_token);
        onTokenChange(sessionId, res.share_token);
      })
      .catch(() => {
        if (!cancelled) setError("無法產生分享連結，請稍後再試。");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sessionId]);

  const shareUrl = token ? `${window.location.origin}/?shared=${token}` : "";

  async function handleCopy(): Promise<void> {
    if (!shareUrl) return;
    const copied = await copyToClipboard(shareUrl);
    if (copied) {
      message.success("已複製分享連結");
    } else {
      message.error("複製失敗，請手動選取連結複製。");
    }
  }

  async function handleRevoke(): Promise<void> {
    if (!sessionId) return;
    setRevoking(true);
    try {
      await revokeShareLink(sessionId);
      onTokenChange(sessionId, null);
      message.success("已取消分享，原本的連結已失效。");
      onClose();
    } catch {
      message.error("取消分享失敗，請稍後再試。");
    } finally {
      setRevoking(false);
    }
  }

  return (
    <Modal
      title={
        <span>
          <LinkOutlined className="mr-2 text-(--accent)" />
          分享文章
        </span>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={480}
    >
      <p className="mb-4 mt-2 text-sm text-black/70">
        取得連結的已登入使用者，可以唯讀查看這篇學習紀錄，並可收藏或複製成自己的筆記。
      </p>
      {loading && <p className="m-0 text-sm text-black/60">正在產生分享連結⋯⋯</p>}
      {error && <p className="m-0 text-sm text-red-600">{error}</p>}
      {!loading && !error && token && (
        <>
          <div className="flex gap-2">
            <Input readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
            <Button type="primary" icon={<CopyOutlined />} onClick={handleCopy}>
              複製
            </Button>
          </div>
          <div className="mt-4 flex justify-end">
            <Popconfirm
              title="取消分享？"
              description="連結會立即失效，其他人的收藏也會看不到這篇文章。"
              okText="取消分享"
              cancelText="保留"
              okButtonProps={{ danger: true }}
              onConfirm={handleRevoke}
            >
              <Button danger size="small" loading={revoking}>
                取消分享
              </Button>
            </Popconfirm>
          </div>
        </>
      )}
    </Modal>
  );
}
