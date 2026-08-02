import SiteFooter from "../shared/SiteFooter";
import HowItWorks from "./HowItWorks";

export default function LandingPage(): React.ReactElement {
  return (
    <div className="min-h-screen w-full px-6 py-10 sm:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="flex items-center justify-between">
          <a href="/" className="flex w-fit items-center gap-2 no-underline">
            <img src="/logo.webp" alt="句句通 logo" className="h-8 w-8 shrink-0" />
            <span className="app-title-heading text-2xl font-semibold text-(--accent)">
              句句通
            </span>
          </a>
          <a href="?view=login" className="link-accent text-base font-semibold">
            登入 / 註冊
          </a>
        </header>

        <main className="w-full rounded-[30px] border-4 border-(--card-border) bg-(--card-bg) shadow-md">
          <div className="px-8 py-10 sm:px-12 sm:py-14">
            <section className="max-w-3xl">
              <h1 className="m-0 [font-family:var(--font-heading)] text-4xl leading-tight sm:text-5xl">
                句句通
              </h1>
              <p className="mb-0 mt-5 text-lg leading-8 text-black/70 sm:text-xl">
                貼上英文文章、逐句翻譯、解析句構、自動建立單字卡。
              </p>
              <p className="mb-0 mt-3 text-base leading-7 text-black/60">
                適合想讀懂原文文章、但卡在長句與生字的英文學習者。
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a
                  href="?view=login&mode=signup"
                  className="btn-accent inline-flex items-center justify-center rounded-full px-7 py-3.5 text-base font-semibold no-underline"
                >
                  免費註冊，開始使用
                </a>
                <a
                  href="?view=login&demo=1"
                  className="btn-outline-accent inline-flex items-center justify-center rounded-full border-2 border-(--card-border) bg-transparent px-7 py-3.5 text-base font-semibold"
                >
                  查看示範帳號
                </a>
              </div>
            </section>

            <section aria-labelledby="features-heading" className="mt-14 sm:mt-16">
              <h2
                id="features-heading"
                className="m-0 text-2xl font-semibold text-(--text-main) sm:text-3xl"
              >
                怎麼使用
              </h2>
              <p className="mb-8 mt-2 text-base leading-7 text-black/65">
                從貼上文章到讀懂長句，只要四個步驟。
              </p>

              <HowItWorks />

              <p className="mb-0 mt-8 text-sm leading-7 text-black/65">
                除此之外還有：文章理解與單字測驗（附熟練度標記）、真人語音朗讀，以及筆記列印與分享連結。
              </p>
            </section>
          </div>
        </main>

        <SiteFooter />
      </div>
    </div>
  );
}
