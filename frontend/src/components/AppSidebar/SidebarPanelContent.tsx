import HistoryPanel from "./panels/HistoryPanel";
import ProfilePanel from "./panels/ProfilePanel";
import SettingsPanel from "./panels/SettingsPanel";

export default function SidebarPanelContent({ activePanel, username, email, onSignOut }: {
  activePanel: string | null;
  username: string;
  email: string;
  onSignOut: () => void;
}): React.ReactElement | null {
  if (activePanel === "profile") {
    return <ProfilePanel username={username} email={email} onSignOut={onSignOut} />;
  }
  if (activePanel === "settings") {
    return <SettingsPanel />;
  }
  if (activePanel === "history") {
    return <HistoryPanel activePanel={activePanel} />;
  }
  return null;
}
