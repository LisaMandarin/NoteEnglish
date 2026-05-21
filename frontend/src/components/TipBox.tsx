import { InfoCircleOutlined, CloseOutlined } from "@ant-design/icons";

interface TipBoxProps {
  message: string;
  onDismiss: () => void;
}

export default function TipBox({ message, onDismiss }: TipBoxProps) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm shadow-sm"
      style={{ background: "var(--bg-main)", borderColor: "var(--accent)", color: "var(--accent)" }}
    >
      <InfoCircleOutlined className="shrink-0" />
      <span>{message}</span>
      <button
        onClick={onDismiss}
        className="ml-1 opacity-60 hover:opacity-100 leading-none"
        style={{ color: "var(--accent)" }}
        aria-label="Dismiss tip"
      >
        <CloseOutlined style={{ fontSize: 11 }} />
      </button>
    </div>
  );
}
