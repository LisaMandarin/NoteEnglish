import { App } from "antd";
import type { MessageInstance } from "antd/es/message/interface";

// antd's static `message` can't consume the dynamic theme from ConfigProvider
// (it renders outside the React tree), so main.tsx mounts <AntdMessageBridge>
// inside <App> and every call site imports this context-aware instance instead
// of `message` from "antd".
export let message: MessageInstance;

export function AntdMessageBridge(): null {
  message = App.useApp().message;
  return null;
}
