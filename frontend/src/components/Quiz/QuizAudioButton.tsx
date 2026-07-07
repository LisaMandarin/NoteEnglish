import { useEffect, useRef, useState } from "react";
import { Button } from "antd";
import { LoadingOutlined, SoundOutlined } from "@ant-design/icons";
import { claimPlayback, getTtsAudioUrl, releasePlayback, speak } from "../../lib/speech";

// Minimal one-tap TTS play/replay button for quiz prompts. Unlike TtsButton's
// popover player, a quiz answer only needs "hear it again", not seek/speed.
export default function QuizAudioButton({
  text,
  ariaLabel,
}: {
  text: string;
  ariaLabel: string;
}): React.ReactElement {
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopPlayback = useRef<() => void>(() => {
    audioRef.current?.pause();
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

  async function play(): Promise<void> {
    if (loading) return;
    setLoading(true);
    try {
      const url = await getTtsAudioUrl(text);
      if (!audioRef.current) audioRef.current = new Audio();
      const audio = audioRef.current;
      if (audio.src !== url) audio.src = url;
      audio.currentTime = 0;
      claimPlayback(stopPlayback);
      await audio.play();
    } catch {
      speak(text);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      shape="circle"
      onClick={() => void play()}
      icon={loading ? <LoadingOutlined spin /> : <SoundOutlined />}
      aria-label={ariaLabel}
    />
  );
}
