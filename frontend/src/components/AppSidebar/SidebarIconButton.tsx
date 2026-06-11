import type { ComponentType } from "react";
import { Button, Tooltip } from "antd";

type SidebarButtonConfig = {
  key: string;
  ariaLabel: (username: string) => string;
  icon: ComponentType<{ "aria-hidden"?: boolean | "true" | "false" }>;
};

export default function SidebarIconButton({ button, isActive, username, ariaControls = undefined, onClick }: {
  button: SidebarButtonConfig;
  isActive: boolean;
  username: string;
  ariaControls?: string;
  onClick: () => void;
}): React.ReactElement {
  return (
    <Tooltip title={button.ariaLabel(username)} placement="right">
      <Button
        aria-label={button.ariaLabel(username)}
        aria-expanded={isActive}
        aria-controls={ariaControls}
        onClick={onClick}
        icon={<button.icon aria-hidden="true" />}
        shape="circle"
        size="large"
        className="flex h-12 w-12 items-center justify-center border-0 text-xl shadow-sm transition"
        style={{
          backgroundColor: isActive ? "var(--accent)" : "rgb(255 255 255 / 0.8)",
          color: isActive ? "#ffffff" : "var(--accent)",
        }}
      />
    </Tooltip>
  );
}
