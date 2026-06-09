import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import AdminSidebar from "./AdminSidebar";
import UserManagementView from "./UserManagementView";

type AdminView = "management";

function getDisplayName(user: User): string {
  const metadataName = user?.user_metadata?.display_name?.trim();
  if (metadataName) return metadataName;
  const email = user?.email?.trim();
  if (email) return email.split("@")[0];
  return "Admin";
}

export default function AdminDashboard({
  user,
  onSignOut,
}: {
  user: User;
  onSignOut: () => void;
}): React.ReactElement {
  const [activeView, setActiveView] = useState<AdminView>("management");
  const username = getDisplayName(user);

  return (
    <div className="min-h-screen w-full px-6 pb-10 pt-20 sm:px-10 lg:py-10">
      <div
        className="mx-auto max-w-7xl gap-5 transition-[grid-template-columns] duration-300 lg:grid lg:grid-cols-[auto_minmax(0,1fr)]"
      >
        <AdminSidebar
          username={username}
          email={user?.email ?? ""}
          onSignOut={onSignOut}
          activeView={activeView}
          onSetView={setActiveView}
        />

        <main className="rounded-[30px] border-4 border-(--card-border) bg-(--card-bg) shadow-md">
          {activeView === "management" && <UserManagementView />}
        </main>
      </div>
    </div>
  );
}
