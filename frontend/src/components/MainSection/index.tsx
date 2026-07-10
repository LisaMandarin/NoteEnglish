import { useState } from "react";
import AppTitle from "./AppTitle";
import AppTextarea from "./AppTextarea";
import TranslationsList from "../Translations";
import TipBox from "./TipBox";
import TokenUsageView from "../shared/TokenUsageView";
import IssueReportForm from "../IssueReport/IssueReportForm";
import QuizView from "../Quiz";
import ReviewQuiz from "../Quiz/ReviewQuiz";
import { useTranslation } from "../../context/translationContext";
import HomeDashboard from "./HomeDashboard";

export default function AppMainSection({
  mainView,
  username,
  onShowTranslate,
  onDoneReport,
  onShowQuiz,
  onStartReview,
  onShowHome,
}: {
  mainView: "home" | "translate" | "usage" | "report" | "quiz" | "review";
  username: string;
  onShowTranslate: () => void;
  onDoneReport: () => void;
  onShowQuiz: () => void;
  onStartReview: () => void;
  onShowHome: () => void;
}): React.ReactElement {
  const {
    state: { sessionLoading, sentences },
  } = useTranslation();
  const [showTip, setShowTip] = useState(
    () => localStorage.getItem("ne_lookup_tip") !== "1",
  );

  function handleDismissTip(): void {
    localStorage.setItem("ne_lookup_tip", "1");
    setShowTip(false);
  }

  let content: React.ReactElement;

  if (mainView === "usage") {
    content = <TokenUsageView />;
  } else if (mainView === "quiz") {
    content = <QuizView onExit={onShowTranslate} />;
  } else if (mainView === "review") {
    content = <ReviewQuiz onExit={onShowHome} />;
  } else if (mainView === "report") {
    content = <IssueReportForm onDone={onDoneReport} />;
  } else if (mainView === "home") {
    content = (
      <HomeDashboard
        username={username}
        onShowTranslate={onShowTranslate}
        onStartReview={onStartReview}
      />
    );
  } else {
    content = (
      <div className="relative rounded-[30px] border-4 border-(--card-border) bg-(--card-bg) shadow-md">
        {sessionLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[26px] bg-white/60 backdrop-blur-sm">
            <p className="text-sm font-medium text-black/50">
              Opening session...
            </p>
          </div>
        )}
        <div className="w-full m-0 px-8 py-10 box-border sm:px-12">
          <AppTextarea />

          <div className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h2 className="text-xl font-semibold">Translations</h2>
              {showTip && sentences.length > 0 && (
                <TipBox
                  message="小技巧：選取英文字詞來查詢"
                  onDismiss={handleDismissTip}
                />
              )}
            </div>
            <TranslationsList onStartQuiz={onShowQuiz} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Logo doubles as the home link (the standalone home icon is gone) */}
      <AppTitle
        title="句句通"
        className="mb-4 hidden items-center gap-2 lg:flex"
        onClick={onShowHome}
      />
      {content}
    </div>
  );
}
