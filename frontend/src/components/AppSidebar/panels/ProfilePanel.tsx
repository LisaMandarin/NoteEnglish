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
        Welcome
      </p>
      <h2 className="mb-4 text-3xl leading-tight">Good to see you, {username}.</h2>
      <p className="m-0 text-base text-black/70">
        Use this space for quick account details, shortcuts, or status notes
        while you work through your session history.
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
