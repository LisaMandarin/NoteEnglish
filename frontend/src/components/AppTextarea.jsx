import { Typography, Input, Button, Alert } from "antd"
import { useTranslation } from "../context/translationContext"
const { Text } = Typography
const { TextArea } = Input

export default function AppTextarea() {
    const {
        state: {text, loading, error},
        actions: {translate, setText, clear}
    } = useTranslation()

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
                onClick={translate}
                loading={loading}
              >
                Translate
              </Button>

              <Button onClick={clear} disabled={loading}>
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
        </>
    )
}