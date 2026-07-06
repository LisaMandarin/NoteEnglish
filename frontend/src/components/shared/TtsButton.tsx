import { useEffect, useRef, useState } from "react";
import { Button, Popover, Select, Slider, message } from "antd";
import {
  CaretRightOutlined,
  LoadingOutlined,
  PauseOutlined,
  SoundOutlined,
} from "@ant-design/icons";
import { claimPlayback, getTtsAudioUrl, releasePlayback, speak } from "../../lib/speech";

const RATE_OPTIONS: { value: number; label: string }[] = [0.5, 0.75, 1, 1.25, 1.5].map(
  (r: number) => ({ value: r, label: `${r}x` })
);

// Remember the chosen speed across players within the session.
let preferredRate = 1;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

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
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(preferredRate);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Mirrors `open` for async flows: audio may finish loading after the popover closed.
  const openRef = useRef(false);

  // Stable identity registered with the playback-exclusivity registry.
  const stopPlayback = useRef<() => void>(() => {
    audioRef.current?.pause();
    openRef.current = false;
    setOpen(false);
  }).current;

  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
      }
      releasePlayback(stopPlayback);
    };
  }, [stopPlayback]);

  function ensureAudio(): HTMLAudioElement {
    if (!audioRef.current) {
      const el = new Audio();
      el.preload = "auto";
      el.addEventListener("timeupdate", () => setCurrentTime(el.currentTime));
      el.addEventListener("durationchange", () =>
        setDuration(Number.isFinite(el.duration) ? el.duration : 0)
      );
      el.addEventListener("play", () => setPlaying(true));
      el.addEventListener("pause", () => setPlaying(false));
      audioRef.current = el;
    }
    return audioRef.current;
  }

  async function openPlayer(): Promise<void> {
    openRef.current = true;
    setOpen(true);
    setLoading(true);
    try {
      const url = await getTtsAudioUrl(text);
      if (!openRef.current) return;
      const audio = ensureAudio();
      if (audio.src !== url) {
        audio.src = url;
        setCurrentTime(0);
      }
      audio.playbackRate = rate;
      claimPlayback(stopPlayback);
      await audio.play();
    } catch {
      openRef.current = false;
      setOpen(false);
      message.warning("語音服務暫時無法使用，改用瀏覽器內建語音");
      speak(text);
    } finally {
      setLoading(false);
    }
  }

  function closePlayer(): void {
    audioRef.current?.pause();
    releasePlayback(stopPlayback);
    openRef.current = false;
    setOpen(false);
  }

  async function togglePlay(): Promise<void> {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      if (audio.ended) audio.currentTime = 0;
      claimPlayback(stopPlayback);
      await audio.play();
    } else {
      audio.pause();
    }
  }

  function handleSeek(value: number): void {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setCurrentTime(value);
  }

  function handleRateChange(value: number): void {
    preferredRate = value;
    setRate(value);
    const audio = audioRef.current;
    if (audio) audio.playbackRate = value;
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
        disabled={loading}
        onClick={() => void togglePlay()}
        icon={playing ? <PauseOutlined /> : <CaretRightOutlined />}
        aria-label={playing ? "暫停" : "播放"}
      />
      <Slider
        className="flex-1 min-w-0"
        min={0}
        max={duration > 0 ? duration : 1}
        step={0.1}
        value={Math.min(currentTime, duration > 0 ? duration : 0)}
        onChange={handleSeek}
        disabled={loading || duration <= 0}
        tooltip={{ formatter: (v?: number) => formatTime(v ?? 0) }}
      />
      <span className="shrink-0 text-xs text-(--text-main) tabular-nums">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>
      <Select
        size="small"
        value={rate}
        onChange={handleRateChange}
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
        {loading ? <LoadingOutlined spin /> : <SoundOutlined />}
      </button>
    </Popover>
  );
}
