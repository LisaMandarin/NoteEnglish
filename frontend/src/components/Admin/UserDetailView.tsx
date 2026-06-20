import { ArrowLeftOutlined } from "@ant-design/icons";
import { Button, Tag, Typography } from "antd";
import type { AdminUser } from "../../lib/api";
import TokenUsageView from "../shared/TokenUsageView";

const { Text } = Typography;

export default function UserDetailView({
  user,
  onBack,
}: {
  user: AdminUser;
  onBack: () => void;
}): React.ReactElement {
  const displayName = user.display_name ?? user.email?.split("@")[0] ?? "Unknown";

  return (
    <div className="w-full m-0 px-8 py-10 box-border sm:px-12">
      <Button
        icon={<ArrowLeftOutlined />}
        type="text"
        onClick={onBack}
        className="mb-6 -ml-2 text-(--accent)"
      >
        Back to Users
      </Button>

      <div className="mb-8">
        <h2 className="text-3xl font-semibold mb-1">{displayName}</h2>
        <div className="flex flex-wrap gap-3 items-center mt-2">
          {user.email && <Text type="secondary">{user.email}</Text>}
          {user.role && (
            <Tag color={user.role === "admin" ? "gold" : "blue"}>{user.role}</Tag>
          )}
          {user.created_at && (
            <Text type="secondary" className="text-xs">
              Joined {new Date(user.created_at).toLocaleDateString()}
            </Text>
          )}
          {user.last_sign_in_at && (
            <Text type="secondary" className="text-xs">
              Last sign-in {new Date(user.last_sign_in_at).toLocaleString()}
            </Text>
          )}
        </div>
      </div>

      <TokenUsageView userId={user.id} />
    </div>
  );
}
