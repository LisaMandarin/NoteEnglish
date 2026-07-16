import { useState } from "react";
import { Button } from "antd";
import {
  BarChartOutlined,
  EditOutlined,
  EyeOutlined,
  HistoryOutlined,
  LogoutOutlined,
} from "@ant-design/icons";
import ProfileEditModal from "./ProfileEditModal";
import { supabase } from "../../../lib/supabase";

// Settings with the account section folded in (name / email / sign out),
// the common mobile-app pattern — the old standalone profile panel is gone.
export default function SettingsPanel({ username, email, onSignOut, onShowUsage, onShowQuizHistory }: {
  username: string;
  email: string;
  onSignOut: () => void;
  onShowUsage: () => void;
  onShowQuizHistory: () => void;
}): React.ReactElement {
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  async function handleViewPublicProfile(): Promise<void> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return;
    window.open(`${window.location.pathname}?profile=${userId}`, "_blank", "noopener");
  }

  return (
    <>
      <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-(--accent)">
        設定
      </p>
      <h2 className="mb-4 text-3xl leading-tight">{username}</h2>
      <p className="m-0 text-sm text-black/65">{email}</p>
      <div className="mt-6 flex flex-col items-start gap-3">
        <Button
          icon={<EditOutlined aria-hidden="true" />}
          onClick={() => setProfileModalOpen(true)}
        >
          編輯個人檔案
        </Button>
        <Button
          icon={<EyeOutlined aria-hidden="true" />}
          onClick={handleViewPublicProfile}
        >
          檢視公開檔案
        </Button>
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
      <ProfileEditModal open={profileModalOpen} onClose={() => setProfileModalOpen(false)} />
    </>
  );
}
