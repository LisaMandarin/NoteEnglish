import LibraryPanel from "./panels/LibraryPanel";
import SettingsPanel from "./panels/SettingsPanel";

export default function SidebarPanelContent({ activePanel, username, email, onSignOut, onShowUsage, onShowTranslate }: {
  activePanel: string | null;
  username: string;
  email: string;
  onSignOut: () => void;
  onShowUsage: () => void;
  onShowTranslate: () => void;
}): React.ReactElement | null {
  if (activePanel === "settings") {
    return (
      <SettingsPanel
        username={username}
        email={email}
        onSignOut={onSignOut}
        onShowUsage={onShowUsage}
      />
    );
  }
  if (activePanel === "library") {
    return <LibraryPanel onShowTranslate={onShowTranslate} />;
  }
  return null;
}
