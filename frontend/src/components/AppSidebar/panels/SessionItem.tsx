import type { Dispatch, MouseEvent, RefObject, SetStateAction } from "react";
import { CheckOutlined, CloseOutlined, DeleteOutlined, EditOutlined } from "@ant-design/icons";
import type { SessionRecord } from "../../../types";
import { formatUpdatedAt } from "../../../lib/formatUpdatedAt";

export default function SessionItem({
  session,
  isCurrent,
  sessionLoading,
  saving,
  deletingId,
  editingId,
  editValue,
  setEditValue,
  editSaving,
  editInputRef,
  onLoad,
  onStartEdit,
  onCancelEdit,
  onConfirmEdit,
  onDelete,
}: {
  session: SessionRecord;
  isCurrent: boolean;
  sessionLoading: boolean;
  saving: boolean;
  deletingId: string | null;
  editingId: string | null;
  editValue: string;
  setEditValue: Dispatch<SetStateAction<string>>;
  editSaving: boolean;
  editInputRef: RefObject<HTMLInputElement | null>;
  onLoad: (sessionId: string) => void;
  onStartEdit: (sessionId: string, title: string, e: MouseEvent) => void;
  onCancelEdit: (e?: MouseEvent) => void;
  onConfirmEdit: (sessionId: string, title: string, e: MouseEvent) => void;
  onDelete: (sessionId: string, isCurrent: boolean, e: MouseEvent) => void;
}): React.ReactElement {
  const isEditing = editingId === session.id;
  const isDeleting = deletingId === session.id;
  const title =
    session.title?.trim() ||
    session.source_text?.trim()?.slice(0, 80) ||
    "Untitled session";

  return (
    <div
      className={`group relative w-full rounded-2xl border p-3 text-left transition-all duration-200 ${
        !isCurrent && !isEditing
          ? "hover:shadow-md hover:-translate-y-0.5 hover:border-black/20 hover:bg-white"
          : ""
      }`}
      style={{
        borderColor: isCurrent ? "var(--accent)" : "rgb(0 0 0 / 0.08)",
        backgroundColor: isCurrent
          ? "color-mix(in srgb, var(--accent) 10%, white)"
          : "rgb(255 255 255 / 0.78)",
        opacity: isDeleting ? 0.5 : 1,
      }}
    >
      {isEditing ? (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <input
            ref={editInputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onConfirmEdit(session.id, title, e as unknown as MouseEvent);
              if (e.key === "Escape") onCancelEdit(e as unknown as MouseEvent);
            }}
            disabled={editSaving}
            className="min-w-0 flex-1 rounded-lg border border-black/20 bg-white px-2 py-0.5 text-sm font-semibold text-black/85 outline-none focus:border-(--accent)"
          />
          <button
            type="button"
            onClick={(e) => onConfirmEdit(session.id, title, e)}
            disabled={editSaving}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-(--accent) text-white"
          >
            <CheckOutlined style={{ fontSize: 10 }} />
          </button>
          <button
            type="button"
            onClick={onCancelEdit}
            disabled={editSaving}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/10 text-black/60"
          >
            <CloseOutlined style={{ fontSize: 10 }} />
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => { if (!isCurrent) onLoad(session.id); }}
            disabled={sessionLoading || saving}
            className={`w-full pr-5 text-left ${!isCurrent && !sessionLoading && !saving ? "cursor-pointer" : "cursor-default"}`}
          >
            <p className="m-0 text-base font-semibold text-black/85">{title}</p>
            <div className="mt-2 text-xs leading-tight text-black/55">
              {formatUpdatedAt(session.updated_at)}
            </div>
          </button>
          <button
            type="button"
            onClick={(e) => onStartEdit(session.id, title, e)}
            className="absolute right-2 top-2 cursor-pointer text-black/25 opacity-0 transition-opacity group-hover:opacity-100 hover:text-blue-500"
            aria-label="Edit session title"
          >
            <EditOutlined style={{ fontSize: 13 }} />
          </button>
          <button
            type="button"
            onClick={(e) => onDelete(session.id, isCurrent, e)}
            disabled={isDeleting}
            className="absolute bottom-2 right-2 cursor-pointer text-black/25 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500"
            aria-label="Delete session"
          >
            <DeleteOutlined style={{ fontSize: 13 }} />
          </button>
        </>
      )}
    </div>
  );
}
