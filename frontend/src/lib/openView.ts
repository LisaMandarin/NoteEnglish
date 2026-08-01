// 從主畫面啟動（PWA / 加到主畫面）時沒有分頁概念，也沒有網址列與上一頁鍵。
// 這種情況下 window.open(url, "_blank") 會被降級成同視窗導航：原本的畫面被蓋掉，
// 使用者回不去。開子頁面與離開子頁面兩端都走這裡，行為才會一致。

const STANDALONE_MODES = ["standalone", "minimal-ui", "fullscreen"];

export function isStandaloneDisplay(): boolean {
  // iOS 主畫面 webview 只認 navigator.standalone；display-mode 要 iOS 16.4+ 才有。
  const iosStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (iosStandalone) return true;
  return STANDALONE_MODES.some((mode) =>
    window.matchMedia(`(display-mode: ${mode})`).matches
  );
}

// 開一個同源的子頁面（?view=summary、?view=vocab-print、?profile=…）。
// 必須在點擊事件的原始呼叫堆疊裡同步執行，否則 Safari 會當成未經請求的彈窗擋掉。
export function openAppView(url: string, features = ""): void {
  // 主畫面模式：明確走同視窗導航，確保留下一筆 history，leaveAppView 才回得去。
  // 各版本 iOS 對 window.open 的降級行為不一致，不能靠它自己降級。
  if (isStandaloneDisplay()) {
    window.location.assign(url);
    return;
  }
  window.open(url, "_blank", features);
}

// 離開子頁面回到 app。三種進入情境都要有出路：
// 同視窗導航進來的 → 回上一頁；真的開了新分頁 → 關掉；瀏覽器不給關 → 退回主頁。
export function leaveAppView(): void {
  if (!window.opener && window.history.length > 1) {
    window.history.back();
    return;
  }
  window.close();
  window.setTimeout(() => {
    if (!window.closed) window.location.replace(window.location.pathname);
  }, 150);
}
