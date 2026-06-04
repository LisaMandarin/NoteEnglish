import { useState } from "react";
import type { ComponentType } from "react";
import {
  CloseOutlined,
  FolderOpenOutlined,
  LogoutOutlined,
  MenuOutlined,
  SettingOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Button, Tooltip } from "antd";
import SidebarIconButton from "./SidebarIconButton";
import SidebarPanelContent from "./SidebarPanelContent";

type SidebarButtonConfig = {
  key: string;
  ariaLabel: (username: string) => string;
  icon: ComponentType<{ "aria-hidden"?: boolean | "true" | "false" }>;
};

const SIDEBAR_BUTTONS: SidebarButtonConfig[] = [
  {
    key: "profile",
    ariaLabel: (username: string) => `${username} profile`,
    icon: UserOutlined,
  },
  {
    key: "settings",
    ariaLabel: () => "Settings",
    icon: SettingOutlined,
  },
  {
    key: "history",
    ariaLabel: () => "Session history folders",
    icon: FolderOpenOutlined,
  },
];

export default function AppSidebar({
  activePanel,
  isSidebarOpen,
  onTogglePanel,
  username,
  email,
  onSignOut,
}: {
  activePanel: string | null;
  isSidebarOpen: boolean;
  onTogglePanel: (panelName: string) => void;
  username: string;
  email: string;
  onSignOut: () => void;
}): React.ReactElement {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  function closeMobileMenu(): void {
    setIsMobileMenuOpen(false);
    if (activePanel) onTogglePanel(activePanel);
  }

  return (
    <>
      {/* ===== MOBILE (< lg) ===== */}
      <div className="lg:hidden">
        <div
          className={`fixed inset-0 z-30 bg-black/10 transition-opacity duration-300 ${
            isMobileMenuOpen ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          onClick={closeMobileMenu}
        />

        <button
          className="fixed left-4 top-4 z-50 flex h-12 w-12 items-center justify-center rounded-full border-0 bg-white text-xl shadow-md transition-colors duration-200"
          style={{ color: "var(--accent)" }}
          onClick={() => setIsMobileMenuOpen((v) => !v)}
          aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
        >
          {isMobileMenuOpen ? <CloseOutlined /> : <MenuOutlined />}
        </button>

        <div
          className={`fixed left-18 top-4 z-40 flex flex-row gap-3 transition-all duration-300 ${
            isMobileMenuOpen
              ? "translate-x-0 opacity-100"
              : "-translate-x-8 opacity-0 pointer-events-none"
          }`}
        >
          {SIDEBAR_BUTTONS.map((button) => (
            <SidebarIconButton
              key={button.key}
              button={button}
              isActive={activePanel === button.key}
              username={username}
              onClick={() => onTogglePanel(button.key)}
            />
          ))}
          <Button
            aria-label="Sign out"
            onClick={onSignOut}
            icon={<LogoutOutlined aria-hidden="true" />}
            shape="circle"
            size="large"
            className="flex h-12 w-12 items-center justify-center border-0 text-xl shadow-sm transition"
            style={{
              backgroundColor: "rgb(255 255 255 / 0.8)",
              color: "var(--accent)",
            }}
          />
        </div>

        <div
          className={`fixed left-4 right-4 top-18 z-40 max-h-[70vh] overflow-y-auto rounded-3xl bg-[color-mix(in_srgb,var(--accent)_16%,white)] px-6 py-8 shadow-xl transition-all duration-300 ${
            isMobileMenuOpen && activePanel
              ? "translate-y-0 opacity-100"
              : "-translate-y-3 opacity-0 pointer-events-none"
          }`}
        >
          <SidebarPanelContent
            activePanel={activePanel}
            username={username}
            email={email}
            onSignOut={onSignOut}
          />
        </div>
      </div>

      {/* ===== DESKTOP (lg+) ===== */}
      <aside className="hidden lg:flex min-h-[calc(100vh-5rem)] overflow-hidden rounded-[28px] bg-[color-mix(in_srgb,var(--accent)_16%,white)] shadow-sm">
        <div className="flex w-22 shrink-0 flex-col items-center justify-between px-4 py-5">
          <div className="flex flex-col gap-3">
            {SIDEBAR_BUTTONS.map((button) => (
              <SidebarIconButton
                key={button.key}
                button={button}
                isActive={activePanel === button.key}
                username={username}
                ariaControls="sidebar-panel"
                onClick={() => onTogglePanel(button.key)}
              />
            ))}
          </div>
          <Tooltip title="Sign out" placement="right">
            <Button
              aria-label="Sign out"
              onClick={onSignOut}
              icon={<LogoutOutlined aria-hidden="true" />}
              shape="circle"
              size="large"
              className="flex h-12 w-12 items-center justify-center border-0 text-xl shadow-sm transition"
              style={{
                backgroundColor: "rgb(255 255 255 / 0.8)",
                color: "var(--accent)",
              }}
            />
          </Tooltip>
        </div>

        <section
          id="sidebar-panel"
          className={`overflow-hidden transition-[max-width,padding] duration-300 ${
            isSidebarOpen
              ? "max-w-[320px] px-6 py-8"
              : "pointer-events-none max-w-0 px-0 py-0"
          }`}
          aria-hidden={!isSidebarOpen}
        >
          <div
            className={`w-[320px] max-w-full transition-transform duration-300 ${
              isSidebarOpen ? "translate-x-0" : "-translate-x-8"
            }`}
          >
            <SidebarPanelContent
              activePanel={activePanel}
              username={username}
              email={email}
              onSignOut={onSignOut}
            />
          </div>
        </section>
      </aside>
    </>
  );
}
