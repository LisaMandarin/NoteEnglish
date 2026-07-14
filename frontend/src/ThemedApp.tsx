import { App as AntdApp, ConfigProvider } from "antd";
import App from "./App.jsx";
import AntdMessageBridge from "./components/shared/AntdMessageBridge";

// AntD derives hover/active shades in JS, so it needs a concrete color value —
// resolve the project's --accent from index.css instead of hardcoding it. Read
// at render time (not module eval) so the stylesheet is guaranteed applied.
// <AntdApp> provides the context-aware message instance (see lib/feedback.ts)
// and must render its wrapper element: antd v6 runs in cssVar mode and attaches
// the theme's CSS variables to that element. Layout is unaffected — the app
// sizes itself with viewport units, not parent heights.
export default function ThemedApp(): React.ReactElement {
  const accentColor = getComputedStyle(document.documentElement)
    .getPropertyValue("--accent")
    .trim();
  // antd's default description/secondary text (rgba(0,0,0,0.45)) reads ~3.3:1
  // on the app's card backgrounds and fails WCAG AA; 0.65 alpha reads ~6.8:1.
  const themeTokens: Record<string, string> = {
    colorTextDescription: "rgba(0, 0, 0, 0.65)",
    ...(accentColor ? { colorPrimary: accentColor } : {}),
  };
  return (
    <ConfigProvider theme={{ token: themeTokens }}>
      <AntdApp>
        <AntdMessageBridge />
        <App />
      </AntdApp>
    </ConfigProvider>
  );
}
