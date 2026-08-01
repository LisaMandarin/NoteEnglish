import { Button } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import AppTitle from "./MainSection/AppTitle";

// Shared shell for the app's read-only pages (ProfileView, SharedView):
// title bar + "回首頁" button + card wrapper + loading/error/content states.
// Both pages are deliberately rendered outside TranslationProvider, so
// "going home" is a full reload rather than in-app navigation.
export default function ReadOnlyPageShell({
  maxWidthClassName,
  loading,
  loadingText,
  error,
  errorText,
  children,
}: {
  maxWidthClassName: string;
  loading: boolean;
  loadingText: string;
  error: boolean;
  errorText: string;
  children: React.ReactNode;
}): React.ReactElement {
  function goHome(): void {
    window.location.href = window.location.pathname;
  }

  return (
    <div className="min-h-screen w-full px-6 pb-10 pt-8 sm:px-10">
      <div className={`mx-auto w-full ${maxWidthClassName}`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <AppTitle title="句句通" className="flex items-center gap-2" onClick={goHome} />
          <Button icon={<ArrowLeftOutlined aria-hidden="true" />} onClick={goHome}>
            回首頁
          </Button>
        </div>

        <div className="rounded-[30px] border-4 border-(--card-border) bg-(--card-bg) shadow-md">
          <div className="w-full m-0 box-border px-6 py-8 sm:px-12 sm:py-10">
            {loading && <p className="m-0 text-base text-black/70">{loadingText}</p>}

            {!loading && error && (
              <div className="flex flex-col items-start gap-3">
                <p className="m-0 text-base text-black/80">{errorText}</p>
                <Button type="primary" onClick={goHome}>
                  回首頁
                </Button>
              </div>
            )}

            {!loading && !error && children}
          </div>
        </div>
      </div>
    </div>
  );
}
