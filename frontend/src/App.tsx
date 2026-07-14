import React, { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { TranslationProvider, useTranslation } from "./context/translationContext";
import AppMainSection from "./components/MainSection";
import AppSidebar from "./components/AppSidebar";
import IssueReportBadge from "./components/IssueReport/IssueReportBadge";
import SummaryWindow from "./components/SummaryWindow";
import VocabPrintWindow from "./components/Vocab/VocabPrintWindow";
import LoginPage from "./components/Auth/LoginPage";
import AdminLoginPage from "./components/Auth/AdminLoginPage";
import ResetPasswordPage from "./components/Auth/ResetPasswordPage";
import AdminDashboard from "./components/Admin";
import SharedView from "./components/SharedView";
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

type MainView = "home" | "translate" | "usage" | "report" | "quiz" | "quizHistory";

// Fork handover: SharedView stores the fresh copy's session id in
// sessionStorage and reloads into the main app; this opens it straight in the
// editor. The key is removed before loading, so a StrictMode double-mount or
// manual refresh cannot replay it.
function PendingForkLoader({ onOpen }: { onOpen: () => void }): null {
  const {
    actions: { loadSession },
  } = useTranslation();

  useEffect(() => {
    const pendingId = sessionStorage.getItem("ne_open_session");
    if (!pendingId) return;
    sessionStorage.removeItem("ne_open_session");
    onOpen();
    loadSession(pendingId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

function MainPage({ user, onSignOut }: { user: User; onSignOut: () => void }): React.ReactElement {
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const [mainView, setMainView] = useState<MainView>("home");
  const isSidebarOpen = activePanel !== null;
  const username = getDisplayName(user);

  function togglePanel(panelName: string): void {
    setActivePanel((currentPanel) =>
      currentPanel === panelName ? null : panelName
    );
  }

  function handleShowUsage(): void {
    setMainView("usage");
  }

  function handleShowTranslate(): void {
    setMainView("translate");
  }

  function handleShowReport(): void {
    setMainView("report");
  }

  function handleShowQuiz(): void {
    setMainView("quiz");
  }

  function handleShowQuizHistory(): void {
    setMainView("quizHistory");
  }

  function handleShowHome(): void {
    setMainView("home");
    setActivePanel(null);
  }

  return (
    <TranslationProvider>
      <PendingForkLoader onOpen={handleShowTranslate} />
      <div className="flex min-h-screen w-full flex-col px-6 pb-10 pt-20 sm:px-10 lg:py-10">
        <div
          className="mx-auto w-full max-w-7xl flex-1 gap-5 transition-[grid-template-columns] duration-300 lg:grid lg:grid-cols-[var(--sidebar-width)_minmax(0,1fr)]"
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
            onShowUsage={handleShowUsage}
            onShowQuizHistory={handleShowQuizHistory}
            onShowTranslate={handleShowTranslate}
            onShowHome={handleShowHome}
          />
          <AppMainSection
            mainView={mainView}
            username={username}
            onShowTranslate={handleShowTranslate}
            onDoneReport={handleShowHome}
            onShowQuiz={handleShowQuiz}
            onShowHome={handleShowHome}
          />
        </div>
        <footer className="mx-auto mt-10 max-w-7xl text-center text-sm text-(--text-main) opacity-60">
          <p className="m-0">© {new Date().getFullYear()} 句句通. All rights reserved.</p>
          <p className="m-0">Created by Min-ting (Lisa) Chuang.</p>
        </footer>
      </div>
      <IssueReportBadge onClick={handleShowReport} />
    </TranslationProvider>
  );
}

export default function App(): React.ReactElement {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const params = new URLSearchParams(window.location.search);
  const isSummaryView = params.get("view") === "summary";
  const isVocabPrintView = params.get("view") === "vocab-print";
  const isResetPasswordView = params.get("view") === "reset-password";
  const isAdminDashboard = window.location.pathname === "/admin-dashboard";
  const sharedToken = params.get("shared");

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

  if (isResetPasswordView) {
    return <ResetPasswordPage />;
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

  if (isAdminDashboard) {
    if (!user) return <AdminLoginPage />;
    return (
      <AdminDashboard user={user} onSignOut={() => supabase.auth.signOut({ scope: "local" })} />
    );
  }

  if (!user) {
    // Also the entry for shared links (?shared=): logging in never navigates,
    // so the query string survives and the next render lands on SharedView.
    return <LoginPage />;
  }

  if (sharedToken) {
    return <SharedView token={sharedToken} />;
  }

  return (
    <MainPage
      user={user}
      // scope local: signing out one device must not revoke the sessions of
      // every other device (ResetPasswordPage's global sign-out stays global
      // on purpose — after a password change all old sessions should die).
      onSignOut={() => supabase.auth.signOut({ scope: "local" })}
    />
  );
}
