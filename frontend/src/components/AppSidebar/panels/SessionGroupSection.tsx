import type { ReactNode } from "react";
import { DeleteOutlined, DownOutlined, EditOutlined, FolderOpenOutlined, RightOutlined } from "@ant-design/icons";
import { Tooltip } from "antd";

// One collapsible section in the history list: a topic folder, or the special
// "未分組" bucket (no rename/delete when onRename/onDelete are omitted).
export default function SessionGroupSection({
  name,
  count,
  collapsed,
  onToggle,
  onRename,
  onDelete,
  children,
}: {
  name: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  children: ReactNode;
}): React.ReactElement {
  const isFolder = Boolean(onRename || onDelete);

  return (
    <div>
      <div className="group/section flex items-center gap-1.5 rounded-lg px-1 py-1">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-1.5 cursor-pointer border-0 bg-transparent p-0 text-left text-black/70 hover:text-black/90"
          aria-expanded={!collapsed}
        >
          {collapsed ? <RightOutlined style={{ fontSize: 10 }} /> : <DownOutlined style={{ fontSize: 10 }} />}
          {isFolder && <FolderOpenOutlined className="text-(--accent)" style={{ fontSize: 13 }} />}
          <span className="min-w-0 truncate text-sm font-semibold">{name}</span>
          <span className="shrink-0 text-xs text-black/40">{count}</span>
        </button>
        {onRename && (
          <Tooltip title="重新命名主題">
            <button
              type="button"
              onClick={onRename}
              aria-label="Rename topic"
              className="shrink-0 cursor-pointer rounded-md p-0.5 text-black/25 transition-all duration-150 opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/section:opacity-100 hover:scale-110 hover:bg-blue-50 hover:text-blue-500"
            >
              <EditOutlined style={{ fontSize: 12 }} />
            </button>
          </Tooltip>
        )}
        {onDelete && (
          <Tooltip title="刪除主題（裡面的紀錄會退回未分組）">
            <button
              type="button"
              onClick={onDelete}
              aria-label="Delete topic"
              className="shrink-0 cursor-pointer rounded-md p-0.5 text-black/25 transition-all duration-150 opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/section:opacity-100 hover:scale-110 hover:text-red-500"
            >
              <DeleteOutlined style={{ fontSize: 12 }} />
            </button>
          </Tooltip>
        )}
      </div>
      {!collapsed && <div className="mt-2 space-y-3 pl-1">{children}</div>}
    </div>
  );
}
