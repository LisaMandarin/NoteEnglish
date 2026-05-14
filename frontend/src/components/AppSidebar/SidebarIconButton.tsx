import { Button } from "antd";

export default function SidebarIconButton({ button, isActive, username, ariaControls = undefined, onClick }) {
  return (
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
  );
}
