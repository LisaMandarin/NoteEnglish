import { useEffect, useState } from "react";
import { Result, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { listAdminUsers } from "../../lib/api";
import type { AdminUser } from "../../lib/api";

const { Text } = Typography;

const COLUMNS: ColumnsType<AdminUser> = [
  {
    title: "Email",
    dataIndex: "email",
    key: "email",
    render: (email: string | null) => email ?? <Text type="secondary">—</Text>,
  },
  {
    title: "Display Name",
    dataIndex: "display_name",
    key: "display_name",
    render: (name: string | null) => name ?? <Text type="secondary">—</Text>,
  },
  {
    title: "Role",
    dataIndex: "role",
    key: "role",
    render: (role: string | null) =>
      role ? (
        <Tag color={role === "admin" ? "gold" : "blue"}>{role}</Tag>
      ) : (
        <Text type="secondary">user</Text>
      ),
  },
  {
    title: "Joined",
    dataIndex: "created_at",
    key: "created_at",
    render: (ts: string | null) =>
      ts ? new Date(ts).toLocaleDateString() : <Text type="secondary">—</Text>,
  },
  {
    title: "Last Sign In",
    dataIndex: "last_sign_in_at",
    key: "last_sign_in_at",
    render: (ts: string | null) =>
      ts ? new Date(ts).toLocaleString() : <Text type="secondary">Never</Text>,
  },
];

export default function UserManagementView({
  onSelectUser,
}: {
  onSelectUser: (user: AdminUser) => void;
}): React.ReactElement {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    listAdminUsers()
      .then(setUsers)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "載入使用者資料失敗，請稍後再試。";
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, []);

  const isPermissionError = error.includes("403");

  return (
    <div className="w-full m-0 px-8 py-10 box-border sm:px-12">
      <h2 className="mb-1 text-3xl font-semibold">User Management</h2>
      <p className="mb-8 text-base text-black/60">
        所有已註冊的帳號。點擊一行以查看詳情。
      </p>

      {error ? (
        isPermissionError ? (
          <Result
            status="403"
            title="權限不足"
            subTitle="您沒有權限瀏覽此頁面，請使用管理員帳號登入。"
          />
        ) : (
          <p className="text-sm text-red-600">{error}</p>
        )
      ) : (
        <Table<AdminUser>
          columns={COLUMNS}
          dataSource={users}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20 }}
          size="middle"
          scroll={{ x: "max-content" }}
          onRow={(record) => ({
            onClick: () => onSelectUser(record),
            style: { cursor: "pointer" },
          })}
        />
      )}
    </div>
  );
}
