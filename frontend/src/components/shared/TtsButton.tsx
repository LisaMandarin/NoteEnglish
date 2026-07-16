import { useRef, useState } from "react";
import { Button, Popover, Select, Slider } from "antd";
import { message } from "../../lib/feedback";
import {
  CaretRightOutlined,
  HolderOutlined,
  LoadingOutlined,
  PauseOutlined,
  SoundOutlined,
} from "@ant-design/icons";
import { speak } from "../../lib/speech";
import { RATE_OPTIONS, formatTime, useTtsPlayer } from "../../hooks/useTtsPlayer";

export default function TtsButton({
  text,
  ariaLabel,
  className,
}: {
  text: string;
  ariaLabel: string;
  className?: string;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  // Mirrors `open` for async flows: audio may finish loading after the popover closed.
  const openRef = useRef(false);
  // Popover 可拖曳：偏移量套在 popup root 上，蓋到文字時使用者可以把播放器拖開。
  // bounds 把偏移量夾在視窗內（保留邊距），拖不出螢幕也就不會誤觸瀏覽器邊緣手勢。
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragStart = useRef<{
    pointerX: number;
    pointerY: number;
    baseX: number;
    baseY: number;
    bounds: { minX: number; maxX: number; minY: number; maxY: number } | null;
  } | null>(null);

  // Controls keep their own pointer behavior; everywhere else on the bar drags.
  // The speed <Select>'s dropdown renders in a body-level portal but stays a
  // React-tree child of this bar, so its option pointerdown events still bubble
  // here — match `.ant-select-dropdown` too or capturing the pointer would
  // hijack the option click and the speed never changes.
  function isInteractiveTarget(target: EventTarget | null): boolean {
    return (
      target instanceof Element &&
      !!target.closest("button, .ant-slider, .ant-select, .ant-select-dropdown, input")
    );
  }

  function onPlayerPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    e.stopPropagation();
    if (isInteractiveTarget(e.target)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    // 以拖曳起點當下的 popover 位置換算偏移量的上下限：整個播放器保持在
    // 視窗內、離邊緣至少 EDGE_MARGIN。
    const EDGE_MARGIN = 8;
    const root = e.currentTarget.closest(".ant-popover");
    const rect = root?.getBoundingClientRect();
    dragStart.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      baseX: dragOffset.x,
      baseY: dragOffset.y,
      bounds: rect
        ? {
            minX: dragOffset.x + EDGE_MARGIN - rect.left,
            maxX: dragOffset.x + window.innerWidth - EDGE_MARGIN - rect.right,
            minY: dragOffset.y + EDGE_MARGIN - rect.top,
            maxY: dragOffset.y + window.innerHeight - EDGE_MARGIN - rect.bottom,
          }
        : null,
    };
  }

  function onPlayerPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    const start = dragStart.current;
    if (!start) return;
    let x = start.baseX + e.clientX - start.pointerX;
    let y = start.baseY + e.clientY - start.pointerY;
    if (start.bounds) {
      x = Math.min(Math.max(x, start.bounds.minX), Math.max(start.bounds.minX, start.bounds.maxX));
      y = Math.min(Math.max(y, start.bounds.minY), Math.max(start.bounds.minY, start.bounds.maxY));
    }
    setDragOffset({ x, y });
  }

  function onPlayerPointerEnd(e: React.PointerEvent<HTMLDivElement>): void {
    if (!dragStart.current) return;
    dragStart.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  function closeQuietly(): void {
    openRef.current = false;
    setOpen(false);
  }

  const player = useTtsPlayer(text, { onInterrupted: closeQuietly });

  async function openPlayer(): Promise<void> {
    openRef.current = true;
    setOpen(true);
    setDragOffset({ x: 0, y: 0 });
    try {
      await player.play({ shouldStart: () => openRef.current });
    } catch {
      closeQuietly();
      message.warning("語音服務暫時無法使用，改用瀏覽器內建語音");
      speak(text);
    }
  }

  function closePlayer(): void {
    closeQuietly();
    player.stop();
  }

  const playerContent = (
    <div
      className="flex w-72 max-w-[80vw] cursor-move touch-none items-center gap-2"
      onPointerDown={onPlayerPointerDown}
      onPointerMove={onPlayerPointerMove}
      onPointerUp={onPlayerPointerEnd}
      onPointerCancel={onPlayerPointerEnd}
      onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}
    >
      <span className="shrink-0 text-(--text-main)" aria-label="拖曳移動播放器">
        <HolderOutlined />
      </span>
      <Button
        type="text"
        size="small"
        shape="circle"
        disabled={player.loading}
        onClick={() => void player.toggle()}
        icon={player.playing ? <PauseOutlined /> : <CaretRightOutlined />}
        aria-label={player.playing ? "暫停" : "播放"}
      />
      <Slider
        className="flex-1 min-w-0"
        min={0}
        max={player.duration > 0 ? player.duration : 1}
        step={0.1}
        value={Math.min(player.currentTime, player.duration > 0 ? player.duration : 0)}
        onChange={player.seek}
        disabled={player.loading || player.duration <= 0}
        tooltip={{ formatter: (v?: number) => formatTime(v ?? 0) }}
      />
      <span className="shrink-0 text-xs text-(--text-main) tabular-nums">
        {formatTime(player.currentTime)} / {formatTime(player.duration)}
      </span>
      <Select
        size="small"
        value={player.rate}
        onChange={player.setRate}
        options={RATE_OPTIONS}
        popupMatchSelectWidth={false}
        aria-label="播放速度"
      />
    </div>
  );

  return (
    <Popover
      open={open}
      onOpenChange={(next: boolean) => {
        if (next) void openPlayer();
        else closePlayer();
      }}
      trigger="click"
      content={playerContent}
      placement="bottom"
      styles={{ root: { transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` } }}
    >
      <button
        type="button"
        className={className}
        aria-label={ariaLabel}
        onPointerDown={(e: React.PointerEvent<HTMLButtonElement>) => e.stopPropagation()}
        onClick={(e: React.MouseEvent<HTMLButtonElement>) => e.stopPropagation()}
      >
        {player.loading ? <LoadingOutlined spin /> : <SoundOutlined />}
      </button>
    </Popover>
  );
}
