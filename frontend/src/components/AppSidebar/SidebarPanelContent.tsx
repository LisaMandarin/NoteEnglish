import HistoryPanel from "./panels/HistoryPanel";
import ProfilePanel from "./panels/ProfilePanel";
import SettingsPanel from "./panels/SettingsPanel";

export default function SidebarPanelContent({ activePanel, username, email, onSignOut, onShowUsage, onShowTranslate }: {
  activePanel: string | null;
  username: string;
  email: string;
  onSignOut: () => void;
  onShowUsage: () => void;
  onShowTranslate: () => void;
}): React.ReactElement | null {
  if (activePanel === "profile") {
    return <ProfilePanel username={username} email={email} onSignOut={onSignOut} />;
  }
  if (activePanel === "settings") {
    return <SettingsPanel onShowUsage={onShowUsage} />;
  }
  if (activePanel === "history") {
    return <HistoryPanel activePanel={activePanel} onShowTranslate={onShowTranslate} />;
  }
  return null;
}
