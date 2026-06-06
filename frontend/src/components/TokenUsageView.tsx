import { useEffect, useState } from "react";
import { Spin } from "antd";
import { getTokenUsage } from "../lib/api";
import type { TokenUsageData, UsageHourlyItem, UsageDailyItem, UsageMonthlyItem } from "../types";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function BarChart<T>({
  items,
  getLabel,
  getTokens,
}: {
  items: T[];
  getLabel: (item: T, i: number) => string;
  getTokens: (item: T) => number;
}): React.ReactElement {
  const max = Math.max(...items.map(getTokens), 1);
  return (
    <div className="mt-3">
      <div className="flex items-end gap-0.5 h-14">
        {items.map((item, i) => {
          const tokens = getTokens(item);
          const pct = (tokens / max) * 100;
          return (
            <div key={i} className="flex-1 flex flex-col items-center h-full">
              <div className="flex-1 flex items-end w-full">
                <div
                  className="w-full rounded-t-sm transition-all duration-300"
                  style={{
                    height: tokens > 0 ? `${Math.max(pct, 5)}%` : "2px",
                    backgroundColor: tokens > 0 ? "var(--accent)" : "var(--card-border)",
                    opacity: tokens > 0 ? 0.65 : 0.15,
                  }}
                  title={`${tokens} tokens`}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-0.5 mt-1">
        {items.map((item, i) => (
          <div key={i} className="flex-1 text-center text-[9px] text-black/40 truncate leading-tight">
            {getLabel(item, i)}
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionHeader({ label, total }: { label: string; total: number }): React.ReactElement {
  return (
    <div className="flex items-baseline gap-2 mb-1">
      <span className="text-xs font-semibold uppercase tracking-widest text-(--accent)">{label}</span>
      <span className="text-2xl font-bold">{formatTokens(total)}</span>
      <span className="text-sm text-black/40">tokens</span>
    </div>
  );
}

const DAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

export default function TokenUsageView(): React.ReactElement {
  const [data, setData] = useState<TokenUsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTokenUsage()
      .then((d) => setData(d))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const currentUTCHour = new Date().getUTCHours();
  const last12: UsageHourlyItem[] = data
    ? Array.from({ length: 12 }, (_, i) => {
        const h = (currentUTCHour - 11 + i + 24) % 24;
        return data.today.hourly[h] ?? { hour: h, tokens: 0 };
      })
    : [];
  const last12Total = last12.reduce((s, item) => s + item.tokens, 0);

  return (
    <div className="relative rounded-[30px] border-4 border-(--card-border) bg-(--card-bg) shadow-md">
      <div className="w-full m-0 px-8 py-10 box-border sm:px-12">
        <h2 className="text-2xl font-semibold mb-8">Token 使用量</h2>

        {loading && (
          <div className="flex justify-center py-10">
            <Spin size="large" />
          </div>
        )}

        {error && (
          <p className="text-sm text-red-500">無法載入使用量資料：{error}</p>
        )}

        {data && (
          <div className="flex flex-col gap-10">
            <section>
              <SectionHeader label="近12小時" total={last12Total} />
              <BarChart<UsageHourlyItem>
                items={last12}
                getTokens={(item) => item.tokens}
                getLabel={(item, i) => (i % 3 === 0 ? `${item.hour}h` : "")}
              />
            </section>

            <section>
              <SectionHeader label="本週" total={data.week.total} />
              <BarChart<UsageDailyItem>
                items={data.week.daily}
                getTokens={(item) => item.tokens}
                getLabel={(item) => {
                  const d = new Date(`${item.date}T00:00:00`);
                  return DAY_LABELS[d.getDay()];
                }}
              />
            </section>

            <section>
              <SectionHeader label="近三個月" total={data.months.total} />
              <BarChart<UsageMonthlyItem>
                items={data.months.monthly}
                getTokens={(item) => item.tokens}
                getLabel={(item) => {
                  const month = parseInt(item.month.split("-")[1], 10);
                  return `${month}月`;
                }}
              />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
