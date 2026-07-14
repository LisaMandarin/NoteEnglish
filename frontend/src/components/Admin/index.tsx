import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { LogoutOutlined } from "@ant-design/icons";
import { Button } from "antd";
import AdminSidebar from "./AdminSidebar";
import UserDetailView from "./UserDetailView";
import UserManagementView from "./UserManagementView";
import { checkAdminAccess, listAdminUsers } from "../../lib/api";
import type { AdminUser } from "../../lib/api";

type AdminView = "overview" | "profile" | "management";

function getDisplayName(user: User): string {
  const metadataName = user?.user_metadata?.display_name?.trim();
  if (metadataName) return metadataName;
  const email = user?.email?.trim();
  if (email) return email.split("@")[0];
  return "Admin";
}

function OverviewSection({
  username,
  email,
  userCount,
  loading,
}: {
  username: string;
  email: string;
  userCount: number;
  loading: boolean;
}): React.ReactElement {
  return (
    <div className="px-8 py-10 sm:px-12">
      <p
        className="mb-1 text-sm font-semibold uppercase tracking-widest"
        style={{ color: "var(--accent)" }}
      >
        Welcome back
      </p>
      <h2 className="mb-1 text-3xl font-semibold">{username}</h2>
      <p className="mb-10 text-base text-black/60">{email}</p>

      <div
        className="inline-block rounded-2xl border-4 border-(--card-border) px-8 py-6 shadow-sm"
        style={{ backgroundColor: "color-mix(in srgb, var(--accent) 8%, white)" }}
      >
        <p className="text-xs font-semibold uppercase tracking-widest text-black/60">
          Total Users
        </p>
        <p
          className="mt-1 text-5xl font-bold"
          style={{ color: "var(--accent)" }}
        >
          {loading ? "—" : userCount}
        </p>
        <p className="mt-1 text-sm text-black/60">registered accounts (excluding admins)</p>
      </div>
    </div>
  );
}

function ProfileSection({
  username,
  email,
  onSignOut,
}: {
  username: string;
  email: string;
  onSignOut: () => void;
}): React.ReactElement {
  return (
    <div className="px-8 py-10 sm:px-12">
      <p
        className="mb-1 text-sm font-semibold uppercase tracking-widest"
        style={{ color: "var(--accent)" }}
      >
        Admin
      </p>
      <h2 className="mb-8 text-3xl font-semibold">{username}</h2>

      <div className="space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-black/60">Email</p>
          <p className="mt-1 text-base">{email}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-black/60">Role</p>
          <p className="mt-1 text-base">Admin</p>
        </div>
      </div>

      <Button
        icon={<LogoutOutlined aria-hidden="true" />}
        onClick={onSignOut}
        className="mt-8"
      >
        Sign out
      </Button>
    </div>
  );
}

export default function AdminDashboard({
  user,
  onSignOut,
}: {
  user: User;
  onSignOut: () => void;
}): React.ReactElement {
  const [activeView, setActiveView] = useState<AdminView>("overview");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const username = getDisplayName(user);

  useEffect(() => {
    checkAdminAccess()
      .then(() => setIsAdmin(true))
      .catch(() => setIsAdmin(false));
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    listAdminUsers()
      .then(setUsers)
      .catch(() => {})
      .finally(() => setUsersLoading(false));
  }, [isAdmin]);

  const nonAdminCount = users.filter((u) => u.role !== "admin").length;

  function handleSelectUser(adminUser: AdminUser): void {
    setSelectedUser(adminUser);
  }

  function handleBackToManagement(): void {
    setSelectedUser(null);
  }

  function handleSetView(view: AdminView): void {
    setSelectedUser(null);
    setActiveView(view);
  }

  return (
    <div className="min-h-screen w-full px-6 pb-10 pt-20 sm:px-10 lg:py-10">
      <div className="mx-auto flex max-w-7xl gap-5">
        <AdminSidebar
          onSignOut={onSignOut}
          activeView={activeView}
          onSetView={handleSetView}
          isAdmin={isAdmin === true}
        />

        <main className="min-h-[calc(100vh-7.5rem)] lg:min-h-[calc(100vh-5rem)] flex-1 rounded-[30px] border-4 border-(--card-border) bg-(--card-bg) shadow-md">
          {isAdmin === false && (
            <div className="flex h-full min-h-[calc(100vh-7.5rem)] lg:min-h-[calc(100vh-5rem)] items-center justify-center px-8 py-10 text-center">
              <div>
                <p
                  className="mb-2 text-2xl font-semibold"
                  style={{ color: "var(--accent)" }}
                >
                  權限不足
                </p>
                <p className="text-base text-black/60">
                  您沒有權限瀏覽此頁面，請使用管理員帳號登入。
                </p>
              </div>
            </div>
          )}
          {isAdmin === true && activeView === "overview" && (
            <OverviewSection
              username={username}
              email={user?.email ?? ""}
              userCount={nonAdminCount}
              loading={usersLoading}
            />
          )}
          {isAdmin === true && activeView === "profile" && (
            <ProfileSection
              username={username}
              email={user?.email ?? ""}
              onSignOut={onSignOut}
            />
          )}
          {isAdmin === true && activeView === "management" && !selectedUser && (
            <UserManagementView onSelectUser={handleSelectUser} />
          )}
          {isAdmin === true && activeView === "management" && selectedUser && (
            <UserDetailView user={selectedUser} onBack={handleBackToManagement} />
          )}
        </main>
      </div>
    </div>
  );
}
