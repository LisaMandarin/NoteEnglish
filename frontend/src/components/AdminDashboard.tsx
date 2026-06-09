import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { LogoutOutlined } from "@ant-design/icons";
import { Button } from "antd";
import AdminSidebar from "./AdminSidebar";
import UserDetailView from "./UserDetailView";
import UserManagementView from "./UserManagementView";
import { listAdminUsers } from "../lib/api";
import type { AdminUser } from "../lib/api";

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
        <p className="text-xs font-semibold uppercase tracking-widest text-black/50">
          Total Users
        </p>
        <p
          className="mt-1 text-5xl font-bold"
          style={{ color: "var(--accent)" }}
        >
          {loading ? "—" : userCount}
        </p>
        <p className="mt-1 text-sm text-black/50">registered accounts (excluding admins)</p>
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
          <p className="text-xs font-semibold uppercase tracking-wider text-black/40">Email</p>
          <p className="mt-1 text-base">{email}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-black/40">Role</p>
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
  const username = getDisplayName(user);

  useEffect(() => {
    listAdminUsers()
      .then(setUsers)
      .catch(() => {})
      .finally(() => setUsersLoading(false));
  }, []);

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
    <div className="min-h-screen w-full px-6 pb-10 pt-6 sm:px-10">
      <div className="mx-auto flex max-w-7xl gap-5">
        <AdminSidebar
          onSignOut={onSignOut}
          activeView={activeView}
          onSetView={handleSetView}
        />

        <main className="min-h-[calc(100vh-3rem)] flex-1 rounded-[30px] border-4 border-(--card-border) bg-(--card-bg) shadow-md">
          {activeView === "overview" && (
            <OverviewSection
              username={username}
              email={user?.email ?? ""}
              userCount={nonAdminCount}
              loading={usersLoading}
            />
          )}
          {activeView === "profile" && (
            <ProfileSection
              username={username}
              email={user?.email ?? ""}
              onSignOut={onSignOut}
            />
          )}
          {activeView === "management" && !selectedUser && (
            <UserManagementView onSelectUser={handleSelectUser} />
          )}
          {activeView === "management" && selectedUser && (
            <UserDetailView user={selectedUser} onBack={handleBackToManagement} />
          )}
        </main>
      </div>
    </div>
  );
}
