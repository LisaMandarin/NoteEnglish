import {
  BookOutlined,
  FileDoneOutlined,
  ReadOutlined,
  SoundOutlined,
} from "@ant-design/icons";
import SiteFooter from "../shared/SiteFooter";

const FEATURES = [
  {
    icon: ReadOutlined,
    title: "逐句翻譯與句構分析",
    description: "每個句子都有中文翻譯與文法結構拆解。",
  },
  {
    icon: BookOutlined,
    title: "點選單字建立單字卡",
    description: "自動查詞性、例句與中文翻譯。",
  },
  {
    icon: FileDoneOutlined,
    title: "測驗檢視學習成效",
    description: "文章理解與單字測驗，附熟練度標記。",
  },
  {
    icon: SoundOutlined,
    title: "朗讀、列印、分享",
    description: "真人語音朗讀，筆記可列印或分享給他人。",
  },
];

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
                貼上英文文章，AI 幫你逐句翻譯、解析句構、自動建立單字卡。
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
              <h2 id="features-heading" className="sr-only">
                主要功能
              </h2>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                {FEATURES.map(({ icon: Icon, title, description }) => (
                  <div
                    key={title}
                    className="rounded-3xl border border-black/10 bg-white/70 px-6 py-6"
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--accent)_12%,white)] text-2xl text-(--accent)">
                      <Icon aria-hidden="true" />
                    </span>
                    <h3 className="mb-1 mt-4 text-lg font-semibold text-(--text-main)">
                      {title}
                    </h3>
                    <p className="m-0 text-sm leading-6 text-black/65">
                      {description}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section
              aria-labelledby="demo-heading"
              className="mt-14 rounded-3xl border border-black/10 bg-black/3 px-6 py-5 sm:mt-16"
            >
              <h2 id="demo-heading" className="m-0 text-base font-semibold text-(--text-main)">
                關於示範帳號
              </h2>
              <p className="m-0 mt-2 text-sm text-amber-700">
                示範帳號為公開帳號，任何測試者均可存取其中的內容。若您希望保有私人的學習記錄，請使用自己的電子郵件註冊專屬帳號。
              </p>
            </section>
          </div>
        </main>

        <SiteFooter />
      </div>
    </div>
  );
}
