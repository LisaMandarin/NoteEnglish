import { useState } from "react";
import { Segmented } from "antd";
import HistoryPanel from "./HistoryPanel";
import FavoritesPanel from "./FavoritesPanel";

// 歷史學習紀錄 + 收藏 under one folder icon (library pattern). Each tab
// mounts its panel with the activePanel value that panel's loader expects,
// so switching tabs remounts and refetches.
export default function LibraryPanel({ onShowTranslate }: { onShowTranslate: () => void }): React.ReactElement {
  const [tab, setTab] = useState<"history" | "favorites">("history");

  return (
    <>
      <Segmented
        block
        value={tab}
        onChange={(value) => setTab(value as "history" | "favorites")}
        options={[
          { label: "歷史紀錄", value: "history" },
          { label: "收藏", value: "favorites" },
        ]}
        className="mb-5"
      />
      {tab === "history" ? (
        <HistoryPanel activePanel="history" onShowTranslate={onShowTranslate} />
      ) : (
        <FavoritesPanel activePanel="favorites" />
      )}
    </>
  );
}
