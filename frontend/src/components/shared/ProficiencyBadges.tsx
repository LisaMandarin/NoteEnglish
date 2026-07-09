import { BookOutlined, FileTextOutlined } from "@ant-design/icons";
import { Tooltip } from "antd";
import type { SessionRecord } from "../../types";

// Session-card proficiency badges: 文章熟練度 (理解問答+聽寫) and 單字熟練度
// (克漏字/字義配對/拼字). Each score is the accuracy of the latest quiz run of
// that group only; a group never quizzed renders no badge.
export default function ProficiencyBadges({
  session,
}: {
  session: SessionRecord;
}): React.ReactElement | null {
  const badges: { key: string; icon: React.ReactNode; tip: string; value: number }[] = [];
  if (typeof session.article_proficiency === "number") {
    badges.push({
      key: "article",
      icon: <FileTextOutlined aria-hidden="true" />,
      tip: "文章熟練度(閱讀理解、聽寫)",
      value: session.article_proficiency,
    });
  }
  if (typeof session.word_proficiency === "number") {
    badges.push({
      key: "word",
      icon: <BookOutlined aria-hidden="true" />,
      tip: "單字熟練度(克漏字、字義配對、拼字)",
      value: session.word_proficiency,
    });
  }
  if (badges.length === 0) return null;

  return (
    <>
      {badges.map((badge) => (
        <Tooltip key={badge.key} title={badge.tip}>
          <span
            aria-label={`${badge.tip} ${badge.value}%`}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-(--accent)/12 px-1.5 py-0.5 text-xs font-semibold text-(--accent)"
          >
            {badge.icon}
            {badge.value}%
          </span>
        </Tooltip>
      ))}
    </>
  );
}
