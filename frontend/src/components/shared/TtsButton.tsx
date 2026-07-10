import { useRef, useState } from "react";
import { Button, Popover, Select, Slider } from "antd";
import { message } from "../../lib/feedback";
import {
  CaretRightOutlined,
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

  function closeQuietly(): void {
    openRef.current = false;
    setOpen(false);
  }

  const player = useTtsPlayer(text, { onInterrupted: closeQuietly });

  async function openPlayer(): Promise<void> {
    openRef.current = true;
    setOpen(true);
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
      className="flex w-72 max-w-[80vw] items-center gap-2"
      onPointerDown={(e: React.PointerEvent<HTMLDivElement>) => e.stopPropagation()}
      onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}
    >
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
