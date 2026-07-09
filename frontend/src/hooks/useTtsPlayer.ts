import { useEffect, useRef, useState } from "react";
import { claimPlayback, getTtsAudioUrl, releasePlayback } from "../lib/speech";

export const RATE_OPTIONS: { value: number; label: string }[] = [0.5, 0.75, 1, 1.25, 1.5].map(
  (r: number) => ({ value: r, label: `${r}x` })
);

// Remember the chosen speed across players within the session.
let preferredRate = 1;

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export type PlayOptions = {
  // Restart from the beginning instead of resuming the current position.
  restart?: boolean;
  // Checked after the audio URL loads; returning false skips starting playback
  // (e.g. the popover that requested it has already been closed).
  shouldStart?: () => boolean;
};

export type TtsPlayer = {
  loading: boolean;
  playing: boolean;
  currentTime: number;
  duration: number;
  rate: number;
  // Loads the TTS audio if needed and starts playback. Throws when the audio
  // cannot be fetched — callers decide the fallback (e.g. speech synthesis).
  play: (options?: PlayOptions) => Promise<void>;
  toggle: () => Promise<void>;
  seek: (seconds: number) => void;
  setRate: (rate: number) => void;
  // Pause and release the exclusive-playback claim.
  stop: () => void;
};

// Shared audio-element state machine behind every TTS player UI (popover
// button, inline bar, one-tap replay). Registers with the playback-exclusivity
// registry in lib/speech so only one player sounds at a time; `onInterrupted`
// fires when another player takes over.
export function useTtsPlayer(
  text: string,
  { onInterrupted }: { onInterrupted?: () => void } = {},
): TtsPlayer {
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRateState] = useState(preferredRate);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const onInterruptedRef = useRef(onInterrupted);
  onInterruptedRef.current = onInterrupted;

  // Stable identity registered with the playback-exclusivity registry.
  const stopPlayback = useRef<() => void>(() => {
    audioRef.current?.pause();
    onInterruptedRef.current?.();
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

  async function play(options: PlayOptions = {}): Promise<void> {
    setLoading(true);
    try {
      const url = await getTtsAudioUrl(text);
      if (options.shouldStart && !options.shouldStart()) return;
      const audio = ensureAudio();
      if (audio.src !== url) {
        audio.src = url;
        setCurrentTime(0);
      } else if (options.restart) {
        audio.currentTime = 0;
        setCurrentTime(0);
      }
      audio.playbackRate = rate;
      claimPlayback(stopPlayback);
      await audio.play();
    } finally {
      setLoading(false);
    }
  }

  async function toggle(): Promise<void> {
    const audio = audioRef.current;
    if (!audio || !audio.src) {
      await play();
      return;
    }
    if (audio.paused) {
      if (audio.ended) audio.currentTime = 0;
      claimPlayback(stopPlayback);
      await audio.play();
    } else {
      audio.pause();
    }
  }

  function seek(seconds: number): void {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = seconds;
    setCurrentTime(seconds);
  }

  function setRate(value: number): void {
    preferredRate = value;
    setRateState(value);
    const audio = audioRef.current;
    if (audio) audio.playbackRate = value;
  }

  function stop(): void {
    audioRef.current?.pause();
    releasePlayback(stopPlayback);
  }

  return { loading, playing, currentTime, duration, rate, play, toggle, seek, setRate, stop };
}
