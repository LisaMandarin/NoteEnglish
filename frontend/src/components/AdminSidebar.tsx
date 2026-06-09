import { useState } from "react";
import {
  AppstoreOutlined,
  CloseOutlined,
  LogoutOutlined,
  MenuOutlined,
  ToolOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Button, Tooltip } from "antd";

type AdminView = "overview" | "profile" | "management";

function NavButton({
  icon: Icon,
  label,
  isActive,
  disabled,
  onClick,
}: {
  icon: React.ComponentType<{ "aria-hidden"?: boolean | "true" | "false" }>;
  label: string;
  isActive: boolean;
  disabled: boolean;
  onClick: () => void;
}): React.ReactElement {
  return (
    <Tooltip title={disabled ? null : label} placement="right">
      <Button
        aria-label={label}
        onClick={onClick}
        disabled={disabled}
        icon={<Icon aria-hidden="true" />}
        shape="circle"
        size="large"
        className="flex h-12 w-12 items-center justify-center border-0 text-xl shadow-sm transition"
        style={{
          backgroundColor: isActive && !disabled ? "var(--accent)" : "rgb(255 255 255 / 0.8)",
          color: disabled ? "rgb(0 0 0 / 0.25)" : isActive ? "#ffffff" : "var(--accent)",
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      />
    </Tooltip>
  );
}

export default function AdminSidebar({
  onSignOut,
  activeView,
  onSetView,
  isAdmin,
}: {
  onSignOut: () => void;
  activeView: AdminView;
  onSetView: (view: AdminView) => void;
  isAdmin: boolean;
}): React.ReactElement {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  function handleSetView(view: AdminView): void {
    onSetView(view);
    setIsMobileMenuOpen(false);
  }

  return (
    <>
      {/* ===== MOBILE (< lg) ===== */}
      <div className="lg:hidden">
        <div
          className={`fixed inset-0 z-30 bg-black/10 transition-opacity duration-300 ${
            isMobileMenuOpen ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          onClick={() => setIsMobileMenuOpen(false)}
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
          <NavButton
            icon={AppstoreOutlined}
            label="Overview"
            isActive={activeView === "overview"}
            disabled={!isAdmin}
            onClick={() => handleSetView("overview")}
          />
          <NavButton
            icon={UserOutlined}
            label="Profile"
            isActive={activeView === "profile"}
            disabled={!isAdmin}
            onClick={() => handleSetView("profile")}
          />
          <NavButton
            icon={ToolOutlined}
            label="Management"
            isActive={activeView === "management"}
            disabled={!isAdmin}
            onClick={() => handleSetView("management")}
          />
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
      </div>

      {/* ===== DESKTOP (lg+) ===== */}
      <aside className="hidden lg:flex w-22 shrink-0 flex-col items-center rounded-[28px] bg-[color-mix(in_srgb,var(--accent)_16%,white)] px-4 py-5 shadow-sm">
        <nav className="flex flex-col gap-3">
          <NavButton
            icon={AppstoreOutlined}
            label="Overview"
            isActive={activeView === "overview"}
            disabled={!isAdmin}
            onClick={() => onSetView("overview")}
          />
          <NavButton
            icon={UserOutlined}
            label="Profile"
            isActive={activeView === "profile"}
            disabled={!isAdmin}
            onClick={() => onSetView("profile")}
          />
          <NavButton
            icon={ToolOutlined}
            label="Management"
            isActive={activeView === "management"}
            disabled={!isAdmin}
            onClick={() => onSetView("management")}
          />
        </nav>

        <div className="mt-auto">
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
      </aside>
    </>
  );
}
