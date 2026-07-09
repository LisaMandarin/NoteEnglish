import { Button } from "antd";
import { LoadingOutlined, SoundOutlined } from "@ant-design/icons";
import { speak } from "../../lib/speech";
import { useTtsPlayer } from "../../hooks/useTtsPlayer";

// Minimal one-tap TTS replay button for short prompts (a single word). For
// sentence-length audio with seek/speed, use QuizAudioPlayer instead.
export default function QuizAudioButton({
  text,
  ariaLabel,
}: {
  text: string;
  ariaLabel: string;
}): React.ReactElement {
  const player = useTtsPlayer(text);

  async function play(): Promise<void> {
    if (player.loading) return;
    try {
      await player.play({ restart: true });
    } catch {
      speak(text);
    }
  }

  return (
    <Button
      shape="circle"
      onClick={() => void play()}
      icon={player.loading ? <LoadingOutlined spin /> : <SoundOutlined />}
      aria-label={ariaLabel}
    />
  );
}
