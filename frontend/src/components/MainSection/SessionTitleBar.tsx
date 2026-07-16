import { CheckOutlined, CloseOutlined, EditOutlined } from "@ant-design/icons";
import { Input } from "antd";
import { useTranslation } from "../../context/translationContext";
import { useTitleEdit } from "../../hooks/useTitleEdit";
import { dispatchSessionTitleUpdated } from "../../lib/sessionTitleEvent";

// Title bar shown above the textarea once a session exists (saved via
// translation, or loaded from the sidebar). Lets the user rename the
// session without leaving the main section; mirrors SessionItem.tsx's
// sidebar rename UI so the two stay visually consistent.
export default function SessionTitleBar(): React.ReactElement | null {
  const {
    state: { currentSession },
    actions: { updateCurrentSessionTitle },
  } = useTranslation();

  function handleSaved(sessionId: string, title: string, updatedAt?: string): void {
    updateCurrentSessionTitle(title);
    dispatchSessionTitleUpdated({ sessionId, title, updatedAt });
  }

  const { editing, value, setValue, saving, start, cancel, confirm } =
    useTitleEdit(handleSaved);

  if (!currentSession) return null;

  const title = currentSession.title?.trim() || "Untitled session";

  return (
    <div className="group relative mb-4 flex items-center gap-2">
      {editing ? (
        <div className="flex w-full items-center gap-1">
          <Input
            autoFocus
            allowClear
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirm(currentSession.id, title);
              if (e.key === "Escape") cancel();
            }}
            disabled={saving}
            className="min-w-0 flex-1 [font-family:var(--font-heading)] text-lg font-semibold"
          />
          <button
            type="button"
            onClick={() => confirm(currentSession.id, title)}
            disabled={saving}
            aria-label="Confirm title"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-(--accent) text-white"
          >
            <CheckOutlined style={{ fontSize: 12 }} />
          </button>
          <button
            type="button"
            onClick={() => cancel()}
            disabled={saving}
            aria-label="Cancel title edit"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/10 text-black/60"
          >
            <CloseOutlined style={{ fontSize: 12 }} />
          </button>
        </div>
      ) : (
        <>
          <h2 className="m-0 truncate [font-family:var(--font-heading)] text-xl font-semibold text-(--text-main)">
            {title}
          </h2>
          <button
            type="button"
            onClick={() => start(title)}
            aria-label="Edit session title"
            className="shrink-0 cursor-pointer rounded-md p-1 text-black/60 transition-all duration-150 opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 hover:scale-110 hover:bg-blue-50 hover:text-blue-500"
          >
            <EditOutlined style={{ fontSize: 14 }} />
          </button>
        </>
      )}
    </div>
  );
}
