import AppTitle from "./AppTitle";
import AppTextarea from "./AppTextarea";
import TranslationsList from "./TranslationsList";
import { useTranslation } from "../context/translationContext";

export default function AppMainSection() {
  const { state: { sessionLoading } } = useTranslation();

  return (
    <div className="relative rounded-[30px] border-4 border-(--card-border) bg-(--card-bg) shadow-md">
      {sessionLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[26px] bg-white/60 backdrop-blur-sm">
          <p className="text-sm font-medium text-black/50">Opening session...</p>
        </div>
      )}
      <div className="w-full m-0 px-8 py-10 box-border sm:px-12">
        <AppTitle title="NoteEnglish" />
        <AppTextarea />

        <div className="mt-6">
          <h2 className="text-xl font-semibold mb-2">Translations</h2>
          <TranslationsList />
        </div>
      </div>
    </div>
  );
}
