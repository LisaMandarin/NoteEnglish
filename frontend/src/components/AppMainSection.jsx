import AppTitle from "./AppTitle";
import AppTextarea from "./AppTextarea";
import TranslationsList from "./TranslationsList";

export default function AppMainSection() {
  return (
    <div className="rounded-[30px] border-4 border-(--card-border) bg-(--card-bg) shadow-md">
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
