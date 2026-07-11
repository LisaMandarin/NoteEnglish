import { Button } from "antd";
import { BarChartOutlined, HistoryOutlined, LogoutOutlined } from "@ant-design/icons";

// Settings with the account section folded in (name / email / sign out),
// the common mobile-app pattern — the old standalone profile panel is gone.
export default function SettingsPanel({ username, email, onSignOut, onShowUsage, onShowQuizHistory }: {
  username: string;
  email: string;
  onSignOut: () => void;
  onShowUsage: () => void;
  onShowQuizHistory: () => void;
}): React.ReactElement {
  return (
    <>
      <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-(--accent)">
        設定
      </p>
      <h2 className="mb-4 text-3xl leading-tight">{username}</h2>
      <p className="m-0 text-sm text-black/65">{email}</p>
      <div className="mt-6 flex flex-col items-start gap-3">
        <Button
          icon={<BarChartOutlined aria-hidden="true" />}
          onClick={onShowUsage}
        >
          查看 Token 使用量
        </Button>
        <Button
          icon={<HistoryOutlined aria-hidden="true" />}
          onClick={onShowQuizHistory}
        >
          測驗紀錄
        </Button>
        <Button
          icon={<LogoutOutlined aria-hidden="true" />}
          onClick={onSignOut}
        >
          Sign out
        </Button>
      </div>
    </>
  );
}
