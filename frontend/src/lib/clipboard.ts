// The async Clipboard API only exists in secure contexts (https / localhost).
// LAN dev over http://192.168.x.x — e.g. testing on a phone — falls back to
// the legacy hidden-textarea + execCommand path.
export async function copyToClipboard(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or similar — try the fallback below.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  // readonly stops the keyboard from popping up on mobile.
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  // iOS Safari ignores select() without an explicit range.
  textarea.setSelectionRange(0, text.length);

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  document.body.removeChild(textarea);
  return copied;
}
