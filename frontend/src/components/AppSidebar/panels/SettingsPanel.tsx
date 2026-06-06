import { Button } from "antd";
import { BarChartOutlined } from "@ant-design/icons";

export default function SettingsPanel({ onShowUsage }: { onShowUsage: () => void }): React.ReactElement {
  return (
    <>
      <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-(--accent)">
        系統設定
      </p>
      <h2 className="mb-4 text-3xl leading-tight">查詢你的資格和token使用記錄.</h2>
      <Button
        icon={<BarChartOutlined aria-hidden="true" />}
        onClick={onShowUsage}
        className="mt-1"
      >
        查看 Token 使用量
      </Button>
    </>
  );
}
