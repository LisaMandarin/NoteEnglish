import {
  FolderOpenOutlined,
  LogoutOutlined,
  SettingOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Button } from "antd";

const SIDEBAR_BUTTONS = [
  {
    key: "profile",
    ariaLabel: (username) => `${username} profile`,
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

function SidebarPanelContent({ activePanel, username, email, onSignOut }) {
  if (activePanel === "profile") {
    return (
      <>
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-(--accent)">
          Welcome
        </p>
        <h2 className="mb-4 text-3xl leading-tight">Good to see you, {username}.</h2>
        <p className="m-0 text-base text-black/70">
          Use this space for quick account details, shortcuts, or status notes
          while you work through your session history.
        </p>
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

  if (activePanel === "settings") {
    return (
      <>
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-(--accent)">
          Settings
        </p>
        <h2 className="mb-4 text-3xl leading-tight">Adjust your workspace.</h2>
        <p className="m-0 text-base text-black/70">
          Reserve this section for preferences such as translation options,
          display choices, and account configuration.
        </p>
      </>
    );
  }

  if (activePanel === "history") {
    return (
      <>
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-(--accent)">
          Session Histories
        </p>
        <h2 className="mb-4 text-3xl leading-tight">Reopen previous work.</h2>
        <p className="m-0 text-base text-black/70">
          Use this area to list saved sessions, organize folders, and jump back
          into earlier translation drafts.
        </p>
      </>
    );
  }

  return null;
}

export default function AppSidebar({
  activePanel,
  isSidebarOpen,
  onTogglePanel,
  username,
  email,
  onSignOut,
}) {
  return (
    <aside className="flex min-h-[calc(100vh-5rem)] overflow-hidden rounded-[28px] bg-[color-mix(in_srgb,var(--accent)_16%,white)] shadow-sm">
      <div className="flex w-22 shrink-0 flex-row justify-between px-4 py-5 lg:flex-col lg:items-center">
        <div className="flex flex-row gap-3 lg:flex-col">
          {SIDEBAR_BUTTONS.map((button) => {
            const isActive = activePanel === button.key;

            return (
              <Button
                key={button.key}
                aria-label={button.ariaLabel(username)}
                aria-expanded={isActive}
                aria-controls="sidebar-panel"
                onClick={() => onTogglePanel(button.key)}
                icon={<button.icon aria-hidden="true" />}
                shape="circle"
                size="large"
                className="flex h-12 w-12 items-center justify-center border-0 text-xl shadow-sm transition"
                style={{
                  backgroundColor: isActive
                    ? "var(--accent)"
                    : "rgb(255 255 255 / 0.8)",
                  color: isActive ? "#ffffff" : "var(--accent)",
                }}
              />
            );
          })}
        </div>
      </div>

      <section
        id="sidebar-panel"
        className={`overflow-hidden transition-[max-width,max-height,padding,transform] duration-300 ${
          isSidebarOpen
            ? "max-h-80 max-w-[320px] px-6 py-8 lg:max-h-none"
            : "pointer-events-none max-h-0 max-w-0 px-0 py-0 lg:max-h-none"
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
  );
}
