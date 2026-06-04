import React, { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { TranslationProvider } from "./context/translationContext";
import AppMainSection from "./components/AppMainSection";
import AppSidebar from "./components/AppSidebar";
import SummaryWindow from "./components/SummaryWindow";
import VocabPrintWindow from "./components/VocabPrintWindow";
import LoginPage from "./components/LoginPage";
import { supabase } from "./lib/supabase";
import { ensureProfile as ensureProfileApi } from "./lib/api";

function getDisplayName(user: User): string {
  const metadataName = user?.user_metadata?.display_name?.trim();
  if (metadataName) return metadataName;

  const email = user?.email?.trim();
  if (email) return email.split("@")[0];

  return "User";
}

async function ensureProfile(user: User): Promise<void> {
  if (!user?.id) return;

  const displayName = getDisplayName(user);
  await ensureProfileApi(displayName);
}

function MainPage({ user, onSignOut }: { user: User; onSignOut: () => void }): React.ReactElement {
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const isSidebarOpen = activePanel !== null;
  const username = getDisplayName(user);

  function togglePanel(panelName: string): void {
    setActivePanel((currentPanel) =>
      currentPanel === panelName ? null : panelName
    );
  }

  return (
    <TranslationProvider>
      <div className="min-h-screen w-full px-6 pb-10 pt-20 sm:px-10 lg:py-10">
        <div
          className="mx-auto max-w-7xl gap-5 transition-[grid-template-columns] duration-300 lg:grid lg:grid-cols-[var(--sidebar-width)_minmax(0,1fr)]"
          style={{
            "--sidebar-width": isSidebarOpen ? "408px" : "88px",
          } as React.CSSProperties}
        >
          <AppSidebar
            activePanel={activePanel}
            isSidebarOpen={isSidebarOpen}
            onTogglePanel={togglePanel}
            username={username}
            email={user?.email ?? ""}
            onSignOut={onSignOut}
          />
          <AppMainSection />
        </div>
      </div>
    </TranslationProvider>
  );
}

export default function App(): React.ReactElement {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const params = new URLSearchParams(window.location.search);
  const isSummaryView = params.get("view") === "summary";
  const isVocabPrintView = params.get("view") === "vocab-print";

  useEffect(() => {
    let mounted = true;

    async function loadSession(): Promise<void> {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (session?.user) {
        await ensureProfile(session.user);
      }

      setUser(session?.user ?? null);
      setAuthReady(true);
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;

      const nextUser = session?.user ?? null;

      if (nextUser) {
        ensureProfile(nextUser);
      }

      setUser(nextUser);
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (isSummaryView) {
    return <SummaryWindow />;
  }

  if (isVocabPrintView) {
    return <VocabPrintWindow />;
  }

  if (!authReady) {
    return (
      <div className="min-h-screen w-full px-6 py-10 sm:px-10">
        <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl items-center justify-center">
          <div className="rounded-[30px] border-4 border-(--card-border) bg-(--card-bg) px-8 py-10 shadow-md sm:px-12">
            <p className="m-0 text-base text-black/70">Loading account...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <MainPage
      user={user}
      onSignOut={() => supabase.auth.signOut()}
    />
  );
}
