import { LogoutOutlined } from "@ant-design/icons";
import { Button } from "antd";

export default function ProfilePanel({ username, email, onSignOut }: {
  username: string;
  email: string;
  onSignOut: () => void;
}): React.ReactElement {
  return (
    <>
      <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-(--accent)">
        歡迎你
      </p>
      <h2 className="mb-4 text-3xl leading-tight">{username}</h2>
      <p className="m-0 text-base text-black/70">
        更改你的個人檔案
      </p>
      <p className="mt-4 text-sm text-black/65">{email}</p>
      <Button
        icon={<LogoutOutlined aria-hidden="true" />}
        onClick={onSignOut}
        className="mt-5"
      >
        Sign out
      </Button>
    </>
  );
}
