import { Typography, Input, Button, Alert, Modal } from "antd"
import { useTranslation } from "../context/translationContext"
import { formatUpdatedAt } from "../lib/formatUpdatedAt"
const { Text } = Typography
const { TextArea } = Input

export default function AppTextarea() {
    const {
        state: {text, translating, sessionLoading, saving, error, saveError, updatedAt, sentences},
        actions: {translate, setText, clear}
    } = useTranslation()

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

    return (
        <>
            <div className="mb-3">
              <Text strong>Paste a passage:</Text>
              <TextArea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={8}
                placeholder="Paste a passage here..."
                className="mt-2"
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-3 mb-4">
              <Button
                type="primary"
                onClick={handleTranslate}
                loading={translating}
                disabled={sessionLoading || saving}
              >
                {saving ? "Saving..." : "Translate"}
              </Button>

              <Button onClick={clear} disabled={translating || saving || sessionLoading}>
                Clear
              </Button>
            </div>

            {/* Error */}
            {error && (
              <Alert
                type="error"
                showIcon
                message="Request failed"
                description={
                  <pre className="m-0 whitespace-pre-wrap">{error}</pre>
                }
                className="mb-4"
              />
            )}

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
