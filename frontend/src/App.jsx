import { useState } from "react";
import { TranslationProvider } from "./context/translationContext";
import AppTitle from "./components/AppTitle";
import AppTextarea from "./components/AppTextarea";
import TranslationsList from "./components/TranslationsList";
import SummaryWindow from "./components/SummaryWindow";
import LoginPage from "./components/LoginPage";

function MainPage({ username }) {
  return (
    <TranslationProvider>
      <div className="min-h-screen w-full px-6 py-10 sm:px-10">
        <div className="rounded-[30px] bg-(--card-bg) shadow-md border-4 border-(--card-border)">
          <div className="w-full m-0 px-12 py-10 box-border">
            <AppTitle title="NoteEnglish" username={username} />
            <AppTextarea />

            <div className="mt-6">
              <h2 className="text-xl font-semibold mb-2">Translations</h2>
              <TranslationsList />
            </div>
          </div>
        </div>
      </div>
    </TranslationProvider>
  );
}

export default function App() {
  const [username, setUsername] = useState("");
  const params = new URLSearchParams(window.location.search);
  const isSummaryView = params.get("view") === "summary";

  if (isSummaryView) {
    return <SummaryWindow />;
  }

  if (!username) {
    return <LoginPage onLoginSuccess={setUsername} />;
  }

  return <MainPage username={username} />;
}
