import { useEffect } from "react";
import { App } from "antd";
import { setMessageInstance } from "../../lib/feedback";

// Mounted inside <App> (see ThemedApp): captures the context-aware message
// instance for lib/feedback.ts so the rest of the app can call it statically.
export default function AntdMessageBridge(): null {
  const { message } = App.useApp();

  useEffect(() => {
    setMessageInstance(message);
  }, [message]);

  return null;
}
