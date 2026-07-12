import { useEffect, useRef, useState } from "react"
import { Typography, Input, Button, Alert, Modal } from "antd"
import { useTranslation } from "../../context/translationContext"
import { ocrImage, SESSION_EXPIRED_MESSAGE } from "../../lib/api"
import { fileToCompressedBase64, ImagePrepError } from "../../lib/image"
import sampleArticles from "../../data/sampleArticles"
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
  if (low.includes("does not match input length") || low.includes("not a json array") || low.includes("only strings")) {
    return {
      message:
        "AI 回傳的翻譯句數與原文不符（部分句子被合併或漏掉了）。這通常發生在一次翻譯太多、或格式高度相似的題目時。請改成分段、減少句數後再翻譯一次。",
      technical: detail,
    };
  }
  if (low.includes("502") || low.includes("503") || low.includes("high demand") || low.includes("unavailable")) {
    return { message: "AI 服務目前流量過大，請稍後再試。", technical: detail };
  }
  if (low.includes("429") || low.includes("quota") || low.includes("rate limit")) {
    return { message: "已超過 API 使用限額，請稍後再試。", technical: detail };
  }
  if (low.includes("network") || low.includes("fetch") || low.includes("connect")) {
    return { message: "無法連線至伺服器，請確認網路連線。", technical: detail };
  }
  if (low.includes("not authenticated") || low.includes("401") || detail === SESSION_EXPIRED_MESSAGE) {
    return { message: "驗證已過期，請重新登入。", technical: detail };
  }
  return { message: fallback, technical: detail };
}

const MAX_CHARS = 1500
const WARN_THRESHOLD = 1300

export default function AppTextarea() {
    const {
        state: {text, translating, sessionLoading, saving, error, saveError, ocrError, sentences, currentSession},
        actions: {translate, setText, setOcrText, clear, setOcrError, dismissError}
    } = useTranslation()

    const [ocrLoading, setOcrLoading] = useState<boolean>(false)
    const [editing, setEditing] = useState<boolean>(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    // Text as it was when 編輯原文 was pressed, so 取消編輯 can revert unsaved
    // edits instead of leaving text that no longer matches the translations.
    const editStartTextRef = useRef<string>("")

    const sessionId = currentSession?.id ?? null
    useEffect(() => {
        setEditing(false)
    }, [sessionId])

    const charCount = text.length
    const isOverLimit = charCount > MAX_CHARS
    const isNearLimit = charCount > WARN_THRESHOLD
    const isEmpty = charCount === 0

    // Show a reminder whenever there is text that has not been translated yet.
    // Derived from state (not a one-shot flag) so it clears automatically once the
    // session is translated and when the user switches to another session.
    const isTranslated = Array.isArray(sentences) && sentences.length > 0
    // After a successful translation the input collapses into a compact bar so
    // the results below are what the user sees; 編輯原文 re-expands it.
    const isCollapsed = isTranslated && !editing
    const showUntranslatedNotice =
        !isTranslated && text.trim().length > 0 && !translating && !sessionLoading && !ocrLoading

    function hasVocabCards() {
        return Array.isArray(sentences) && sentences.some(
            (s) => Array.isArray(s.vocab) && s.vocab.length > 0
        )
    }

    function runTranslate(): void {
        setEditing(false)
        void translate()
    }

    function handleTranslate() {
        if (hasVocabCards()) {
            Modal.confirm({
                title: "確定要重新翻譯嗎？",
                content: "按下「確定」將會刪除目前所有的單字卡，此動作無法復原。",
                okText: "確定",
                cancelText: "取消",
                onOk: runTranslate,
            })
        } else {
            runTranslate()
        }
    }

    function handleStartEditing(): void {
        editStartTextRef.current = text
        setEditing(true)
    }

    function handleCancelEditing(): void {
        setText(editStartTextRef.current)
        setEditing(false)
    }

    function handleClear() {
        if (isTranslated) {
            Modal.confirm({
                title: "確定要清除嗎？",
                content: "將清除目前畫面上的文字、翻譯與單字卡。（已儲存的紀錄仍可從左側列表重新開啟）",
                okText: "確定",
                cancelText: "取消",
                onOk: clear,
            })
        } else {
            clear()
        }
    }

    function handleImageButtonClick() {
        if (isTranslated) {
            Modal.confirm({
                title: "確定要用圖片轉文字嗎？",
                content: "辨識結果將取代目前文字。按「翻譯」後會以新內容覆蓋目前 session 原有的翻譯與單字卡。",
                okText: "確定",
                cancelText: "取消",
                onOk: () => fileInputRef.current?.click(),
            })
        } else {
            fileInputRef.current?.click()
        }
    }

    async function handleImagePicked(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        e.target.value = ""
        if (!file) return

        // HEIC/HEIF files often report an empty MIME type, so also accept them by extension.
        const isImage = file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name)
        if (!isImage) {
            setOcrError({ message: "請選擇圖片檔案。", technical: "" })
            return
        }
        if (file.size > 10 * 1024 * 1024) {
            setOcrError({ message: "圖片大小不可超過 10MB。", technical: "" })
            return
        }

        setOcrLoading(true)
        setOcrError(null)
        try {
            const { base64, mimeType } = await fileToCompressedBase64(file)
            const result = await ocrImage(base64, mimeType)
            // Replace the source text but keep the current session; drop the stale
            // translations so a later translate overwrites this session with the new text.
            setOcrText(result.text)
        } catch (err) {
            // Local prep errors already carry an actionable message — show it as-is.
            // Only server/network errors go through parseApiError.
            if (err instanceof ImagePrepError) {
                setOcrError({ message: err.message, technical: "" })
            } else {
                const raw = err instanceof Error ? err.message : String(err)
                setOcrError(parseApiError(raw, "圖片辨識失敗，請稍後再試。"))
            }
        } finally {
            setOcrLoading(false)
        }
    }

    const countColor = isOverLimit ? "text-red-500" : isNearLimit ? "text-orange-400" : "text-(--text-main)"

    return (
        <>
            {isCollapsed ? (
              <div className="mb-4 flex items-center gap-3 rounded-lg border border-(--card-border) bg-(--bg-main) px-4 py-2">
                <Text strong className="shrink-0">原文:</Text>
                <Text className="min-w-0 flex-1 truncate">{text}</Text>
                <Button size="small" onClick={handleStartEditing} disabled={sessionLoading || saving}>
                  編輯原文
                </Button>
              </div>
            ) : (
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
            )}

            {showUntranslatedNotice && (
              <Alert
                type="warning"
                showIcon
                description="目前的文字尚未翻譯，不會存入學習紀錄。若為圖片辨識結果，請先確認內容正確，再按「翻譯」以生成並儲存。"
                className="mb-4"
              />
            )}

            {/* Buttons — hidden while collapsed; 編輯原文 brings them back */}
            {!isCollapsed && (
            <div className="flex flex-wrap gap-3 mb-4">
              <Button
                type="primary"
                onClick={handleTranslate}
                loading={translating}
                disabled={sessionLoading || saving || isEmpty || isOverLimit || ocrLoading}
              >
                {saving ? "儲存中..." : "翻譯"}
              </Button>

              <Button onClick={handleClear} disabled={translating || saving || sessionLoading || isEmpty || ocrLoading}>
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
                onClick={handleImageButtonClick}
                loading={ocrLoading}
                disabled={translating || saving || sessionLoading}
              >
                圖片轉文字
              </Button>
              {isTranslated && editing && (
                <Button onClick={handleCancelEditing} disabled={translating || saving || sessionLoading || ocrLoading}>
                  取消編輯
                </Button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.heic,.heif"
                className="hidden"
                onChange={handleImagePicked}
              />
            </div>
            )}

            {/* Error */}
            {error && (() => {
              const { message: errMsg, technical } = parseApiError(error);
              return (
                <Alert
                  type="error"
                  showIcon
                  closable={{ closeIcon: true, onClose: () => dismissError("translate") }}
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

            {ocrError && (
                <Alert
                  type="error"
                  showIcon
                  closable={{ closeIcon: true, onClose: () => dismissError("ocr") }}
                  description={
                    <div>
                      <p className="m-0 font-medium">{ocrError.message}</p>
                      {ocrError.technical && ocrError.technical !== ocrError.message && (
                        <details className="mt-2">
                          <summary className="text-xs cursor-pointer opacity-60 select-none">技術細節</summary>
                          <pre className="m-0 mt-1 whitespace-pre-wrap text-xs opacity-70">{ocrError.technical}</pre>
                        </details>
                      )}
                    </div>
                  }
                  className="mb-4"
                />
            )}

            {saveError && (
              <Alert
                type="error"
                showIcon
                closable={{ closeIcon: true, onClose: () => dismissError("save") }}
                title="Save failed"
                description={saveError}
                className="mb-4"
              />
            )}
        </>
    )
}
