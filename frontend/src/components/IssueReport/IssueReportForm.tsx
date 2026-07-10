import { useState } from "react";
import { Button, Input, Select } from "antd";
import { submitIssueReport } from "../../lib/api";
import { message } from "../../lib/feedback";

const { TextArea } = Input;

const SEVERITY_OPTIONS = [
  { value: "bug", label: "錯誤回報" },
  { value: "suggestion", label: "功能建議" },
  { value: "other", label: "其他" },
];

export default function IssueReportForm({
  onDone,
}: {
  onDone: () => void;
}): React.ReactElement {
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState<string | undefined>(undefined);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = description.trim().length > 0 && !submitting;

  async function handleSubmit(): Promise<void> {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitIssueReport({ title, severity, description });
      message.success("已送出問題回報，感謝您的回饋！");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "送出失敗，請稍後再試。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative rounded-[30px] border-4 border-(--card-border) bg-(--card-bg) shadow-md">
      <div className="w-full m-0 px-8 py-10 box-border sm:px-12">
        <h2 className="text-2xl font-semibold mb-8">問題回報</h2>

        <div className="flex flex-col gap-5 max-w-xl">
          <div>
            <label className="mb-1 block text-sm font-medium text-(--text-main)">
              標題（選填）
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="簡短描述問題"
              maxLength={100}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-(--text-main)">
              類型（選填）
            </label>
            <Select
              value={severity}
              onChange={setSeverity}
              options={SEVERITY_OPTIONS}
              placeholder="選擇類型"
              allowClear
              className="w-full"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-(--text-main)">
              詳細說明
            </label>
            <TextArea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="請描述您遇到的問題或建議"
              autoSize={{ minRows: 6, maxRows: 12 }}
            />
          </div>

          {error && <p className="m-0 text-sm text-red-500">{error}</p>}

          <div className="flex gap-3">
            <Button
              type="primary"
              onClick={handleSubmit}
              disabled={!canSubmit}
              loading={submitting}
              style={{ backgroundColor: "var(--accent)" }}
            >
              送出
            </Button>
            <Button onClick={onDone} disabled={submitting}>
              取消
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
