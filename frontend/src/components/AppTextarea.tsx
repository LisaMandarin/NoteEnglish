import { useRef, useState } from "react"
import { Typography, Input, Button, Alert, Modal } from "antd"
import { useTranslation } from "../context/translationContext"
import { formatUpdatedAt } from "../lib/formatUpdatedAt"
import { ocrImage } from "../lib/api"
import { fileToCompressedBase64 } from "../lib/image"
import sampleArticles from "../data/sampleArticles"
const { Text } = Typography
const { TextArea } = Input

type ParsedError = { message: string; technical: string };

function parseApiError(raw: string, fallback: string = "翻譯失敗，請稍後再試。"): ParsedError {
  let detail = raw;
  try {
    const parsed = JSON.parse(raw) as { detail?: string };
    if (parsed.detail) detail = parsed.detail;
  } catch {
    // not JSON — use raw as-is
  }

  const low = detail.toLowerCase();
  if (low.includes("502") || low.includes("503") || low.includes("high demand") || low.includes("unavailable")) {
    return { message: "AI 服務目前流量過大，請稍後再試。", technical: detail };
  }
  if (low.includes("429") || low.includes("quota") || low.includes("rate limit")) {
    return { message: "已超過 API 使用限額，請稍後再試。", technical: detail };
  }
  if (low.includes("network") || low.includes("fetch") || low.includes("connect")) {
    return { message: "無法連線至伺服器，請確認網路連線。", technical: detail };
  }
  if (low.includes("not authenticated") || low.includes("401")) {
    return { message: "驗證已過期，請重新登入。", technical: detail };
  }
  return { message: fallback, technical: detail };
}

const MAX_CHARS = 1500
const WARN_THRESHOLD = 1300

export default function AppTextarea() {
    const {
        state: {text, translating, sessionLoading, saving, error, saveError, updatedAt, sentences},
        actions: {translate, setText, clear}
    } = useTranslation()

    const [ocrLoading, setOcrLoading] = useState<boolean>(false)
    const [ocrError, setOcrError] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const charCount = text.length
    const isOverLimit = charCount > MAX_CHARS
    const isNearLimit = charCount > WARN_THRESHOLD
    const isEmpty = charCount === 0

    function hasVocabCards() {
        return Array.isArray(sentences) && sentences.some(
            (s) => Array.isArray(s.vocab) && s.vocab.length > 0
        )
    }

    function handleTranslate() {
        if (hasVocabCards()) {
            Modal.confirm({
                title: "確定要重新翻譯嗎？",
                content: "按下「確定」將會刪除目前所有的單字卡，此動作無法復原。",
                okText: "確定",
                cancelText: "取消",
                onOk: translate,
            })
        } else {
            translate()
        }
    }

    async function handleImagePicked(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        e.target.value = ""
        if (!file) return

        if (!file.type.startsWith("image/")) {
            setOcrError("請選擇圖片檔案。")
            return
        }
        if (file.size > 10 * 1024 * 1024) {
            setOcrError("圖片大小不可超過 10MB。")
            return
        }

        setOcrLoading(true)
        setOcrError(null)
        try {
            const { base64, mimeType } = await fileToCompressedBase64(file)
            const result = await ocrImage(base64, mimeType)
            setText(result.text)
        } catch (err) {
            setOcrError(err instanceof Error ? err.message : String(err))
        } finally {
            setOcrLoading(false)
        }
    }

    const countColor = isOverLimit ? "text-red-500" : isNearLimit ? "text-orange-400" : "text-(--text-main)"

    return (
        <>
            <div className="mb-3">
              <Text strong>貼英文文章:</Text>
              <div className="mt-2">
                <TextArea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={8}
                />
                <div className="text-right mt-1">
                  <span className={`text-xs ${countColor}`}>
                    {isOverLimit ? `-${charCount - MAX_CHARS}/${MAX_CHARS}` : `${charCount}/${MAX_CHARS}`}
                  </span>
                </div>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 mb-4">
              <Button
                type="primary"
                onClick={handleTranslate}
                loading={translating}
                disabled={sessionLoading || saving || isEmpty || isOverLimit || ocrLoading}
              >
                {saving ? "儲存中..." : "翻譯"}
              </Button>

              <Button onClick={clear} disabled={translating || saving || sessionLoading || isEmpty || ocrLoading}>
                清除
              </Button>

              <Button
                onClick={() => {
                  const article = sampleArticles[Math.floor(Math.random() * sampleArticles.length)]
                  setText(article)
                }}
                disabled={translating || saving || sessionLoading || ocrLoading}
              >
                隨機文章
              </Button>

              <Button
                onClick={() => fileInputRef.current?.click()}
                loading={ocrLoading}
                disabled={translating || saving || sessionLoading}
              >
                圖片轉文字
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImagePicked}
              />
            </div>

            {/* Error */}
            {error && (() => {
              const { message: errMsg, technical } = parseApiError(error);
              return (
                <Alert
                  type="error"
                  showIcon
                  description={
                    <div>
                      <p className="m-0 font-medium">{errMsg}</p>
                      {technical && technical !== errMsg && (
                        <details className="mt-2">
                          <summary className="text-xs cursor-pointer opacity-60 select-none">技術細節</summary>
                          <pre className="m-0 mt-1 whitespace-pre-wrap text-xs opacity-70">{technical}</pre>
                        </details>
                      )}
                    </div>
                  }
                  className="mb-4"
                />
              );
            })()}

            {ocrError && (() => {
              const { message: errMsg, technical } = parseApiError(ocrError, "圖片辨識失敗，請稍後再試。");
              return (
                <Alert
                  type="error"
                  showIcon
                  closable={{ onClose: () => setOcrError(null) }}
                  description={
                    <div>
                      <p className="m-0 font-medium">{errMsg}</p>
                      {technical && technical !== errMsg && (
                        <details className="mt-2">
                          <summary className="text-xs cursor-pointer opacity-60 select-none">技術細節</summary>
                          <pre className="m-0 mt-1 whitespace-pre-wrap text-xs opacity-70">{technical}</pre>
                        </details>
                      )}
                    </div>
                  }
                  className="mb-4"
                />
              );
            })()}

            {saveError && (
              <Alert
                type="error"
                showIcon
                message="Save failed"
                description={saveError}
                className="mb-4"
              />
            )}
        </>
    )
}
