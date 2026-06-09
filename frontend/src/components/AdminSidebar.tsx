import { useState } from "react";
import {
  CloseOutlined,
  LogoutOutlined,
  MenuOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Button, Tooltip } from "antd";

type AdminPanel = "profile" | "management";

function IconButton({
  icon: Icon,
  ariaLabel,
  isActive,
  onClick,
  ariaControls,
}: {
  icon: React.ComponentType<{ "aria-hidden"?: boolean | "true" | "false" }>;
  ariaLabel: string;
  isActive: boolean;
  onClick: () => void;
  ariaControls?: string;
}): React.ReactElement {
  return (
    <Tooltip title={ariaLabel} placement="right">
      <button
        aria-label={ariaLabel}
        aria-controls={ariaControls}
        aria-expanded={isActive}
        onClick={onClick}
        className="flex h-12 w-12 items-center justify-center rounded-full border-0 text-xl shadow-sm transition"
        style={{
          backgroundColor: isActive
            ? "var(--accent)"
            : "rgb(255 255 255 / 0.8)",
          color: isActive ? "#ffffff" : "var(--accent)",
        }}
      >
        <Icon aria-hidden="true" />
      </button>
    </Tooltip>
  );
}

function PanelContent({
  activePanel,
  username,
  email,
  onSignOut,
}: {
  activePanel: AdminPanel | null;
  username: string;
  email: string;
  onSignOut: () => void;
}): React.ReactElement | null {
  if (activePanel === "profile") {
    return (
      <>
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-(--accent)">
          Admin
        </p>
        <h2 className="mb-4 text-3xl leading-tight">{username}</h2>
        <p className="mt-4 text-sm text-black/65">{email}</p>
        <Button
          icon={<LogoutOutlined aria-hidden="true" />}
          onClick={onSignOut}
          className="mt-5"
        >
          Sign out
        </Button>
      </>
    );
  }
  return null;
}

export default function AdminSidebar({
  username,
  email,
  onSignOut,
  activeView,
  onSetView,
}: {
  username: string;
  email: string;
  onSignOut: () => void;
  activeView: Exclude<AdminPanel, "profile">;
  onSetView: (view: Exclude<AdminPanel, "profile">) => void;
}): React.ReactElement {
  const [activePanel, setActivePanel] = useState<AdminPanel | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  function togglePanel(panel: AdminPanel): void {
    setActivePanel((current) => (current === panel ? null : panel));
  }

  function closeMobileMenu(): void {
    setIsMobileMenuOpen(false);
    if (activePanel) togglePanel(activePanel);
  }

  const isSidebarOpen = activePanel !== null;

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
          <IconButton
            icon={UserOutlined}
            ariaLabel={`${username} profile`}
            isActive={activePanel === "profile"}
            onClick={() => togglePanel("profile")}
          />
          <IconButton
            icon={TeamOutlined}
            ariaLabel="Manage users"
            isActive={activeView === "management"}
            onClick={() => { onSetView("management"); closeMobileMenu(); }}
          />
          <Button
            aria-label="Sign out"
            onClick={onSignOut}
            icon={<LogoutOutlined aria-hidden="true" />}
            shape="circle"
            size="large"
            className="flex h-12 w-12 items-center justify-center border-0 text-xl shadow-sm transition"
            style={{ backgroundColor: "rgb(255 255 255 / 0.8)", color: "var(--accent)" }}
          />
        </div>

        <div
          className={`fixed left-4 right-4 top-18 z-40 max-h-[70vh] overflow-y-auto rounded-3xl bg-[color-mix(in_srgb,var(--accent)_16%,white)] px-6 py-8 shadow-xl transition-all duration-300 ${
            isMobileMenuOpen && activePanel
              ? "translate-y-0 opacity-100"
              : "-translate-y-3 opacity-0 pointer-events-none"
          }`}
        >
          <PanelContent
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
            <IconButton
              icon={UserOutlined}
              ariaLabel={`${username} profile`}
              isActive={activePanel === "profile"}
              ariaControls="admin-sidebar-panel"
              onClick={() => togglePanel("profile")}
            />
            <IconButton
              icon={TeamOutlined}
              ariaLabel="Manage users"
              isActive={activeView === "management"}
              onClick={() => onSetView("management")}
            />
          </div>
          <Tooltip title="Sign out" placement="right">
            <Button
              aria-label="Sign out"
              onClick={onSignOut}
              icon={<LogoutOutlined aria-hidden="true" />}
              shape="circle"
              size="large"
              className="flex h-12 w-12 items-center justify-center border-0 text-xl shadow-sm transition"
              style={{ backgroundColor: "rgb(255 255 255 / 0.8)", color: "var(--accent)" }}
            />
          </Tooltip>
        </div>

        <section
          id="admin-sidebar-panel"
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
            <PanelContent
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
