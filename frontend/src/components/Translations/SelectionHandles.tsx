import type { TouchEvent as ReactTouchEvent } from "react";
import type { SelectionHandleRects } from "../../hooks/useSelectionMenu";

// Drag handles rendered as a fixed overlay at both ends of the touch-selection
// highlight (mobile multi-word selection). Rendering outside the sentence text
// keeps them from disturbing layout; they only exist while a touch selection
// is active, so the desktop mouse path never shows them.
export default function SelectionHandles({
  rects,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  rects: SelectionHandleRects | null;
  onDragStart: (which: "start" | "end", e: ReactTouchEvent<HTMLElement>) => void;
  onDragMove: (e: ReactTouchEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}): React.ReactElement | null {
  if (!rects) return null;

  return (
    <>
      {(["start", "end"] as const).map((which) => {
        const point = rects[which];
        return (
          <span
            key={which}
            className="selection-handle"
            aria-hidden="true"
            style={{ left: point.x, top: point.y + point.height }}
            onTouchStart={(e) => onDragStart(which, e)}
            onTouchMove={onDragMove}
            onTouchEnd={onDragEnd}
            onTouchCancel={onDragEnd}
          />
        );
      })}
    </>
  );
}
