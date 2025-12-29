import { TranslationProvider } from "./context/translationContext";
import AppTitle from "./components/AppTitle";
import AppTextarea from "./components/AppTextarea";
import TranslationsList from "./components/TranslationsList";

export default function App() {
  return (
    <TranslationProvider>
      <div className="min-h-screen w-full px-6 py-10 sm:px-10">
        <div className="rounded-[30px] bg-[var(--card-bg)] shadow-md border-4 border-[var(--card-border)]">
          <div className="w-full m-0 px-12 py-10 box-border">
            <AppTitle title="NoteEnglish" />
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
