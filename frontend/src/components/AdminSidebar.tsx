import { AppstoreOutlined, LogoutOutlined, ToolOutlined, UserOutlined } from "@ant-design/icons";
import { Button } from "antd";

type AdminView = "overview" | "profile" | "management";

function NavButton({
  icon: Icon,
  label,
  isActive,
  onClick,
}: {
  icon: React.ComponentType<{ "aria-hidden"?: boolean | "true" | "false" }>;
  label: string;
  isActive: boolean;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition"
      style={
        isActive
          ? { backgroundColor: "var(--accent)", color: "#fff" }
          : { color: "var(--accent)" }
      }
    >
      <Icon aria-hidden="true" />
      {label}
    </button>
  );
}

export default function AdminSidebar({
  onSignOut,
  activeView,
  onSetView,
}: {
  onSignOut: () => void;
  activeView: AdminView;
  onSetView: (view: AdminView) => void;
}): React.ReactElement {
  return (
    <aside className="flex w-52 shrink-0 flex-col rounded-[28px] bg-[color-mix(in_srgb,var(--accent)_16%,white)] px-5 py-8 shadow-sm">
      <p
        className="mb-8 text-xs font-semibold uppercase tracking-widest"
        style={{ color: "var(--accent)" }}
      >
        Admin Panel
      </p>

      <nav className="flex flex-col gap-1">
        <NavButton
          icon={AppstoreOutlined}
          label="Overview"
          isActive={activeView === "overview"}
          onClick={() => onSetView("overview")}
        />
        <NavButton
          icon={UserOutlined}
          label="Profile"
          isActive={activeView === "profile"}
          onClick={() => onSetView("profile")}
        />
        <NavButton
          icon={ToolOutlined}
          label="Management"
          isActive={activeView === "management"}
          onClick={() => onSetView("management")}
        />
      </nav>

      <div className="mt-auto pt-8">
        <Button
          icon={<LogoutOutlined aria-hidden="true" />}
          onClick={onSignOut}
          block
        >
          Sign out
        </Button>
      </div>
    </aside>
  );
}
