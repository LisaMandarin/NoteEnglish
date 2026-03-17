import { useState } from "react";
import { TranslationProvider } from "./context/translationContext";
import AppMainSection from "./components/AppMainSection";
import AppSidebar from "./components/AppSidebar";
import SummaryWindow from "./components/SummaryWindow";
import LoginPage from "./components/LoginPage";

function MainPage({ username }) {
  const [activePanel, setActivePanel] = useState(null);
  const isSidebarOpen = activePanel !== null;

  function togglePanel(panelName) {
    setActivePanel((currentPanel) =>
      currentPanel === panelName ? null : panelName
    );
  }

  return (
    <TranslationProvider>
      <div className="min-h-screen w-full px-6 py-10 sm:px-10">
        <div
          className="mx-auto grid max-w-7xl gap-5 transition-[grid-template-columns] duration-300 lg:grid-cols-[var(--sidebar-width)_minmax(0,1fr)]"
          style={{
            "--sidebar-width": isSidebarOpen ? "408px" : "88px",
          }}
        >
          <AppSidebar
            activePanel={activePanel}
            isSidebarOpen={isSidebarOpen}
            onTogglePanel={togglePanel}
            username={username}
          />
          <AppMainSection />
        </div>
      </div>
    </TranslationProvider>
  );
}

export default function App() {
  const [username, setUsername] = useState("");
  const params = new URLSearchParams(window.location.search);
  const isSummaryView = params.get("view") === "summary";

  if (isSummaryView) {
    return <SummaryWindow />;
  }

  if (!username) {
    return <LoginPage onLoginSuccess={setUsername} />;
  }

  return <MainPage username={username} />;
}
