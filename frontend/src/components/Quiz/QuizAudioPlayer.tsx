import { Button, Select, Slider, message } from "antd";
import { CaretRightOutlined, LoadingOutlined, PauseOutlined } from "@ant-design/icons";
import { speak } from "../../lib/speech";
import { RATE_OPTIONS, formatTime, useTtsPlayer } from "../../hooks/useTtsPlayer";

// Always-visible TTS player for dictation: unlike TtsButton's popover, it
// stays open while the user types, and exposes seek + speed directly.
export default function QuizAudioPlayer({ text }: { text: string }): React.ReactElement {
  const player = useTtsPlayer(text);

  async function handleToggle(): Promise<void> {
    try {
      await player.toggle();
    } catch {
      message.warning("語音服務暫時無法使用，改用瀏覽器內建語音");
      speak(text);
    }
  }

  return (
    <div className="flex w-full max-w-md items-center gap-2 rounded-xl border-2 border-(--card-border)/20 bg-white px-3 py-2">
      <Button
        type="text"
        size="small"
        shape="circle"
        onClick={() => void handleToggle()}
        icon={
          player.loading ? (
            <LoadingOutlined spin />
          ) : player.playing ? (
            <PauseOutlined />
          ) : (
            <CaretRightOutlined />
          )
        }
        aria-label={player.playing ? "暫停" : "播放"}
      />
      <Slider
        className="flex-1 min-w-0"
        min={0}
        max={player.duration > 0 ? player.duration : 1}
        step={0.1}
        value={Math.min(player.currentTime, player.duration > 0 ? player.duration : 0)}
        onChange={player.seek}
        disabled={player.duration <= 0}
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
}
