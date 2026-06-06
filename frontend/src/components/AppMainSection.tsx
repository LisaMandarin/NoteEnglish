import { useState, useEffect } from "react";
import AppTitle from "./AppTitle";
import AppTextarea from "./AppTextarea";
import TranslationsList from "./TranslationsList";
import TipBox from "./TipBox";
import TokenUsageView from "./TokenUsageView";
import { useTranslation } from "../context/translationContext";

export default function AppMainSection({
  mainView,
}: {
  mainView: "translate" | "usage";
}): React.ReactElement {
  const { state: { sessionLoading, currentSession, sentences } } = useTranslation();
  const [showTip, setShowTip] = useState(true);

  useEffect(() => {
    setShowTip(true);
  }, [currentSession?.id]);

  if (mainView === "usage") {
    return <TokenUsageView />;
  }

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
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h2 className="text-xl font-semibold">Translations</h2>
            {showTip && sentences.length > 0 && (
              <TipBox
                message="小技巧：選取英文字詞來查詢"
                onDismiss={() => setShowTip(false)}
              />
            )}
          </div>
          <TranslationsList />
        </div>
      </div>
    </div>
  );
}
