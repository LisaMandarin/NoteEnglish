import { Tooltip } from "antd";

export default function IssueReportBadge({
  onClick,
}: {
  onClick: () => void;
}): React.ReactElement {
  return (
      <button
        type="button"
        onClick={onClick}
        className="fixed right-0 bottom-0 z-50 cursor-pointer rounded-tl-md bg-(--accent) px-2 py-2 text-(--card-bg)! shadow-md transition-opacity hover:opacity-90"
        style={{ writingMode: "vertical-rl" }}
      >
        問題回報
      </button>
  );
}
