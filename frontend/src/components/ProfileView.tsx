import { useEffect, useState } from "react";
import { Button } from "antd";
import { ArrowLeftOutlined, LinkOutlined } from "@ant-design/icons";
import type { PublicProfile } from "../types";
import { getPublicProfile } from "../lib/api";
import AppTitle from "./MainSection/AppTitle";

// Read-only public profile page (?profile={userId}). Like SharedView, this is
// deliberately NOT wrapped in TranslationProvider — a read-only page must stay
// structurally incapable of writing to anyone's session. No edit controls.
export default function ProfileView({ userId }: { userId: string }): React.ReactElement {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // userId comes from the query string, so it can only change via a full page
  // reload — initial state already covers the loading/error reset.
  useEffect(() => {
    let cancelled = false;
    getPublicProfile(userId)
      .then((data) => {
        if (cancelled) return;
        setProfile(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  function goHome(): void {
    // Strip ?profile and reload: lands on the normal app with a fresh view state.
    window.location.href = window.location.pathname;
  }

  return (
    <div className="min-h-screen w-full px-6 pb-10 pt-8 sm:px-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <AppTitle title="句句通" className="flex items-center gap-2" onClick={goHome} />
          <Button icon={<ArrowLeftOutlined />} onClick={goHome}>
            回首頁
          </Button>
        </div>

        <div className="rounded-[30px] border-4 border-(--card-border) bg-(--card-bg) shadow-md">
          <div className="w-full m-0 box-border px-6 py-8 sm:px-12 sm:py-10">
            {loading && <p className="m-0 text-base text-black/70">正在載入個人檔案⋯⋯</p>}

            {!loading && error && (
              <div className="flex flex-col items-start gap-3">
                <p className="m-0 text-base text-black/80">
                  找不到這位使用者，可能是帳號不存在或對方未公開個人檔案。
                </p>
                <Button type="primary" onClick={goHome}>
                  回首頁
                </Button>
              </div>
            )}

            {!loading && !error && profile && (
              <>
                <p className="m-0 mb-1 text-sm font-semibold uppercase tracking-[0.24em] text-(--accent)">
                  個人檔案
                </p>
                <h2 className="m-0 text-2xl leading-snug sm:text-3xl">
                  {profile.display_name?.trim() || "使用者"}
                </h2>

                {profile.bio?.trim() && (
                  <p className="m-0 mt-4 whitespace-pre-wrap text-base leading-relaxed text-(--text-main)">
                    {profile.bio}
                  </p>
                )}

                {profile.links.length > 0 && (
                  <ul className="m-0 mt-6 flex list-none flex-col gap-2 p-0">
                    {profile.links.map((link, idx) => (
                      <li key={idx} className="m-0 flex min-w-0 items-baseline gap-2">
                        <LinkOutlined aria-hidden="true" className="shrink-0 text-(--accent)" />
                        <span className="shrink-0 text-sm font-semibold">{link.label}</span>
                        {/* Show the full URL as the link text so the real
                            domain is always visible — no phishing disguise. */}
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="link-accent min-w-0 break-all text-sm"
                        >
                          {link.url}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}

                {!profile.bio?.trim() && profile.links.length === 0 && (
                  <p className="m-0 mt-4 text-base text-black/60">
                    這位使用者尚未填寫個人檔案。
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
