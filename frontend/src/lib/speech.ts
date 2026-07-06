import { fetchTtsAudio } from "./api";

// Object URLs of synthesized audio keyed by text, LRU-capped so blobs get revoked.
const URL_CACHE = new Map<string, string>();
const URL_CACHE_MAX = 40;

export async function getTtsAudioUrl(text: string): Promise<string> {
  const cached = URL_CACHE.get(text);
  if (cached) {
    URL_CACHE.delete(text);
    URL_CACHE.set(text, cached);
    return cached;
  }

  const blob = await fetchTtsAudio(text);
  const url = URL.createObjectURL(blob);
  URL_CACHE.set(text, url);

  if (URL_CACHE.size > URL_CACHE_MAX) {
    const oldestText = URL_CACHE.keys().next().value as string | undefined;
    if (oldestText !== undefined) {
      const oldestUrl = URL_CACHE.get(oldestText);
      if (oldestUrl) URL.revokeObjectURL(oldestUrl);
      URL_CACHE.delete(oldestText);
    }
  }

  return url;
}

// Only one player may sound at a time; starting a new one stops the previous.
let stopCurrent: (() => void) | null = null;

export function claimPlayback(stop: () => void): void {
  if (stopCurrent && stopCurrent !== stop) stopCurrent();
  stopCurrent = stop;
}

export function releasePlayback(stop: () => void): void {
  if (stopCurrent === stop) stopCurrent = null;
}

// Browser speech synthesis, kept only as a fallback when /api/tts is unavailable.
export function speak(text: string): void {
  if (!text || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = "en-US";
  window.speechSynthesis.speak(utt);
}
