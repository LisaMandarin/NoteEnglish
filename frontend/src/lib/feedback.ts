import type { MessageInstance } from "antd/es/message/interface";

// antd's static `message` can't consume the dynamic theme from ConfigProvider
// (it renders outside the React tree), so <AntdMessageBridge> hands the
// context-aware instance to this module and call sites keep the familiar
// message.success(...) API. Before the bridge mounts, calls are silent no-ops.
let instance: MessageInstance | null = null;

export function setMessageInstance(next: MessageInstance): void {
  instance = next;
}

type MessageArgs = Parameters<MessageInstance["success"]>;

export const message = {
  success: (...args: MessageArgs): void => { instance?.success(...args); },
  error: (...args: MessageArgs): void => { instance?.error(...args); },
  warning: (...args: MessageArgs): void => { instance?.warning(...args); },
  info: (...args: MessageArgs): void => { instance?.info(...args); },
  loading: (...args: MessageArgs): void => { instance?.loading(...args); },
};
