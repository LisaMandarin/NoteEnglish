import { useEffect, useRef, useState } from "react";
import { PauseCircleOutlined, PlayCircleOutlined } from "@ant-design/icons";

/**
 * Landing-page "how it works" demo: a mock app window that plays the four-step
 * flow (paste → translate → look up a word → break down the structure) next to
 * a caption list that stays in sync.
 *
 * The mock is a deliberate abstraction of the real UI, not a pixel copy — it
 * only has to convey the flow, so the real app can evolve without it going
 * stale. The stage is aria-hidden decoration; the captions carry the meaning
 * (and are the page's indexable copy).
 */

const SENTENCES = [
  {
    en: "Reading in English feels hard at first.",
    zh: "一開始讀英文會覺得很吃力。",
  },
  {
    en: "But the sentences that look long are often simple ideas joined together.",
    zh: "但那些看起來很長的句子，其實常常只是簡單的想法組合在一起。",
  },
];

const ARTICLE = SENTENCES.map((s) => s.en).join(" ");
const TYPE_SPEED_MS = 26;
const TYPING_MS = ARTICLE.length * TYPE_SPEED_MS;

type StepDef = {
  title: string;
  description: string;
  /** How long the step stays on screen before auto-advancing, in ms. */
  duration: number;
};

const STEPS: StepDef[] = [
  {
    title: "貼上英文文章",
    description: "任何一段英文都可以，貼上後按一下翻譯，AI 會自動斷句。",
    duration: TYPING_MS + 1600,
  },
  {
    title: "逐句對照閱讀",
    description: "每個句子都配上編號與中文翻譯，長文章也不會讀到迷路。",
    duration: 4600,
  },
  {
    title: "點選單字建立單字卡",
    description: "點一下不懂的字，自動查出詞性、例句與中文翻譯，並收進單字庫。",
    duration: 5200,
  },
  {
    title: "拆解句子結構",
    description: "主詞、動詞、補語標上不同顏色，看懂長句到底是怎麼組成的。",
    duration: 4600,
  },
];

const delay = (ms: number): React.CSSProperties => ({ animationDelay: `${ms}ms` });

/** Types `text` out one character at a time; renders it whole when `instant`. */
function TypingText({
  text,
  paused,
  instant,
}: {
  text: string;
  paused: boolean;
  instant: boolean;
}): React.ReactElement {
  const [count, setCount] = useState<number>(instant ? text.length : 0);

  useEffect(() => {
    if (paused || instant || count >= text.length) return;
    const id = window.setTimeout(() => setCount((c) => c + 1), TYPE_SPEED_MS);
    return () => window.clearTimeout(id);
  }, [count, paused, instant, text]);

  return (
    <>
      {text.slice(0, count)}
      <span className="lp-caret" />
    </>
  );
}

function StepPaste({ paused, instant }: { paused: boolean; instant: boolean }): React.ReactElement {
  return (
    <div className="lp-body">
      <div className="lp-field-label">英文文章</div>
      <div className="lp-textarea">
        <TypingText text={ARTICLE} paused={paused} instant={instant} />
      </div>
      <div className="lp-toolbar">
        <span className="lp-btn lp-press" style={delay(TYPING_MS + 250)}>
          翻譯
          <span className="lp-ripple" style={delay(TYPING_MS + 250)} />
        </span>
      </div>
    </div>
  );
}

function StepTranslate(): React.ReactElement {
  return (
    <div className="lp-body">
      <ol className="lp-sentences">
        {SENTENCES.map((s, i) => (
          <li key={s.en} className="lp-sentence lp-in" style={delay(i * 900)}>
            <span className="lp-num">{i + 1}</span>
            <div className="min-w-0">
              <p className="lp-en">{s.en}</p>
              <p className="lp-zh lp-in" style={delay(i * 900 + 500)}>
                {s.zh}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function StepVocab(): React.ReactElement {
  const [before, after] = SENTENCES[1].en.split("joined");

  return (
    <div className="lp-body">
      <div className="lp-sentence">
        <span className="lp-num">2</span>
        <div className="min-w-0">
          <p className="lp-en">
            {before}
            <span className="lp-hit">
              <span className="lp-hit__word" style={delay(1000)}>
                joined
              </span>
              <span className="lp-tap" style={delay(950)} />
              <span className="lp-cursor" style={delay(150)}>
                <svg viewBox="0 0 24 24" width="18" height="18" focusable="false">
                  <path
                    d="M5 2.5 19 12l-6.2 1.1L9.6 19.5z"
                    fill="#fff"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </span>
            {after}
          </p>
          <p className="lp-zh">{SENTENCES[1].zh}</p>
        </div>
      </div>

      <div className="lp-card lp-in" style={delay(1450)}>
        <div className="lp-card__head">
          <span className="lp-card__word">join</span>
          <span className="lp-pos">VERB</span>
        </div>
        <p className="lp-card__zh">連接；結合</p>
        <p className="lp-card__def">to bring two or more things together</p>
        <div className="lp-card__example">
          <p>
            Two rivers <em>join</em> near the city.
          </p>
          <p className="lp-card__example-zh">兩條河在城市附近匯合。</p>
        </div>
        <div className="lp-dots">
          {[0, 1, 2, 3, 4].map((n) => (
            <span key={n} className={n < 3 ? "lp-dot lp-dot--on" : "lp-dot"} />
          ))}
        </div>
      </div>
    </div>
  );
}

const SLOTS = [
  { text: "But", role: "", cat: "" },
  { text: "the sentences that look long", role: "S", cat: "subj" },
  { text: "are", role: "V", cat: "pred" },
  { text: "often simple ideas joined together", role: "SC", cat: "pp" },
];

function StepStructure(): React.ReactElement {
  return (
    <div className="lp-body">
      <div className="lp-skeleton">
        {SLOTS.map((slot, i) => (
          <span
            key={slot.text}
            className={slot.cat ? `lp-slot lp-slot--${slot.cat} lp-in` : "lp-slot lp-in"}
            style={delay(i * 600)}
          >
            <span className="lp-slot__words">{slot.text}</span>
            {slot.role && <span className="lp-slot__label">{slot.role}</span>}
          </span>
        ))}
      </div>
      <div className="lp-pattern lp-in" style={delay(SLOTS.length * 600)}>
        <span className="lp-pattern__badge">SVC</span>
        <span>主詞＋動詞＋補語</span>
      </div>
    </div>
  );
}

export default function HowItWorks(): React.ReactElement {
  const [reduced] = useState<boolean>(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );
  const [step, setStep] = useState<number>(0);
  // Bumped on resume / manual jump to remount the stage so its CSS animations
  // replay from the top.
  const [runId, setRunId] = useState<number>(0);
  const [userPaused, setUserPaused] = useState<boolean>(false);
  const [inView, setInView] = useState<boolean>(false);
  const [tabVisible, setTabVisible] = useState<boolean>(true);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const playing = inView && tabVisible && !userPaused && !reduced;

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    // isIntersecting is true for a single visible pixel, so compare the ratio —
    // the threshold list only controls when the callback fires.
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.intersectionRatio >= 0.25),
      { threshold: [0, 0.25] },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onChange = (): void => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const id = window.setTimeout(
      () => setStep((s) => (s + 1) % STEPS.length),
      STEPS[step].duration,
    );
    return () => window.clearTimeout(id);
  }, [playing, step, runId]);

  const goTo = (i: number): void => {
    setStep(i);
    setUserPaused(false);
    setRunId((r) => r + 1);
  };

  const togglePause = (): void => {
    setUserPaused((p) => {
      if (p) setRunId((r) => r + 1);
      return !p;
    });
  };

  const frozen = !playing;

  return (
    <div
      ref={rootRef}
      className={`grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:items-center lg:gap-10 ${
        frozen ? "lp-paused" : ""
      }`}
    >
      <div className="lp-stage lg:order-2" aria-hidden="true">
        <div className="lp-chrome">
          <span className="lp-chrome__dot" />
          <span className="lp-chrome__dot" />
          <span className="lp-chrome__dot" />
          <span className="lp-chrome__title">句句通</span>
        </div>
        <div className="lp-screen" key={`${step}-${runId}`}>
          {step === 0 && <StepPaste paused={frozen} instant={reduced} />}
          {step === 1 && <StepTranslate />}
          {step === 2 && <StepVocab />}
          {step === 3 && <StepStructure />}
        </div>
      </div>

      <div className="lg:order-1">
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {STEPS.map((s, i) => {
            const active = i === step;
            return (
              <li key={s.title}>
                <button
                  type="button"
                  onClick={() => goTo(i)}
                  aria-current={active ? "step" : undefined}
                  className={`lp-caption ${active ? "lp-caption--active" : ""}`}
                >
                  <span className="lp-caption__num">{i + 1}</span>
                  <span className="min-w-0">
                    <span className="lp-caption__title">{s.title}</span>
                    <span className="lp-caption__desc">{s.description}</span>
                  </span>
                  {active && !reduced && (
                    <span className="lp-progress">
                      <span
                        key={`${step}-${runId}`}
                        className="lp-progress__bar"
                        style={{ animationDuration: `${s.duration}ms` }}
                      />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>

        {!reduced && (
          <button
            type="button"
            onClick={togglePause}
            aria-label={userPaused ? "播放示範動畫" : "暫停示範動畫"}
            className="lp-playpause"
          >
            {userPaused ? <PlayCircleOutlined /> : <PauseCircleOutlined />}
            <span>{userPaused ? "播放示範" : "暫停示範"}</span>
          </button>
        )}
      </div>
    </div>
  );
}
