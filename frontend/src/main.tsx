import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App as AntdApp, ConfigProvider } from "antd";
import "./index.css";
import App from "./App.jsx";
import "antd/dist/reset.css";
import { AntdMessageBridge } from "./lib/feedback";

// AntD derives hover/active shades in JS, so it needs a concrete color value —
// resolve the project's --accent from index.css instead of hardcoding it. Read
// at render time (not module eval) so the stylesheet is guaranteed applied.
// <AntdApp> provides the context-aware message instance (see lib/feedback.tsx);
// component={false} keeps it from adding a wrapper element around the layout.
function ThemedApp(): React.ReactElement {
  const accentColor = getComputedStyle(document.documentElement)
    .getPropertyValue("--accent")
    .trim();
  return (
    <ConfigProvider theme={accentColor ? { token: { colorPrimary: accentColor } } : undefined}>
      <AntdApp component={false}>
        <AntdMessageBridge />
        <App />
      </AntdApp>
    </ConfigProvider>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ThemedApp />
  </StrictMode>
);
