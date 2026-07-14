import { useEffect, useState } from "react";
import { Progress, Spin } from "antd";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import { getAdminUserTokenUsage, getTokenUsage } from "../../lib/api";
import type { TokenUsageData } from "../../types";

const tokenNumberFormatter = new Intl.NumberFormat("zh-TW");
const localHourFormatter = new Intl.DateTimeFormat("zh-TW", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const localDateTimeFormatter = new Intl.DateTimeFormat("zh-TW", {
  month: "numeric",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

type UsageChartDatum = {
  axisLabel: string;
  label: string;
  tokens: number;
};

function CustomTooltip({
  active,
  payload,
}: TooltipContentProps<number, string>): React.ReactElement | null {
  const item = payload?.[0]?.payload as UsageChartDatum | undefined;

  if (!active || !item) return null;

  return (
    <div className="rounded-xl border-2 border-(--card-border) bg-(--card-bg) px-3 py-2 shadow-md">
      <p className="m-0 text-xs font-semibold text-(--accent)">{item.label}</p>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-lg font-bold text-(--text-main)">
          {tokenNumberFormatter.format(item.tokens)}
        </span>
        <span className="text-xs text-(--text-main) opacity-50">tokens</span>
      </div>
    </div>
  );
}

function UsageBarChart({
  items,
  description,
}: {
  items: UsageChartDatum[];
  description: string;
}): React.ReactElement {
  return (
    <div className="mt-3">
      <BarChart<UsageChartDatum>
        responsive
        data={items}
        margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
        style={{ width: "100%", height: 170 }}
        title={description}
        desc={`${description}，單位為 tokens`}
      >
        <CartesianGrid
          vertical={false}
          stroke="var(--card-border)"
          strokeDasharray="3 3"
          strokeOpacity={0.14}
        />
        <XAxis<UsageChartDatum, string>
          dataKey="label"
          axisLine={{ stroke: "var(--card-border)", strokeOpacity: 0.25 }}
          tickLine={false}
          tick={{ fill: "var(--text-main)", fillOpacity: 0.55, fontSize: 11 }}
          tickFormatter={(_label, index) => items[index]?.axisLabel ?? ""}
          interval={0}
        />
        <YAxis<UsageChartDatum, number>
          width="auto"
          axisLine={false}
          tickLine={false}
          tick={{ fill: "var(--text-main)", fillOpacity: 0.45, fontSize: 10 }}
          tickFormatter={formatTokens}
          tickCount={4}
          domain={[0, "auto"]}
          niceTicks="snap125"
        />
        <Tooltip
          content={CustomTooltip}
          cursor={{ fill: "var(--accent)", fillOpacity: 0.08 }}
          isAnimationActive="auto"
        />
        <Bar<UsageChartDatum, number>
          dataKey="tokens"
          name="Token 使用量"
          fill="var(--accent)"
          fillOpacity={0.76}
          activeBar={{ fill: "var(--card-border)", fillOpacity: 0.88 }}
          radius={[6, 6, 0, 0]}
          maxBarSize={40}
          minPointSize={2}
        />
      </BarChart>
    </div>
  );
}

function SectionHeader({ label, total }: { label: string; total: number }): React.ReactElement {
  return (
    <div className="flex items-baseline gap-2 mb-1">
      <span className="text-xs font-semibold uppercase tracking-widest text-(--accent)">{label}</span>
      <span className="text-2xl font-bold">{formatTokens(total)}</span>
      <span className="text-sm text-black/60">tokens</span>
    </div>
  );
}

const LIMITS = {
  last12h: 10_000,
  month: 200_000,
};

function UsageProgressSection({
  label,
  total,
  limit,
}: {
  label: string;
  total: number;
  limit: number;
}): React.ReactElement {
  const pct = Math.min(Math.round((total / limit) * 100), 100);
  const strokeColor =
    pct >= 90 ? "#ef4444" : pct >= 70 ? "#f97316" : "var(--accent)";
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-(--accent)">
          {label}
        </span>
        <span className="text-2xl font-bold">{formatTokens(total)}</span>
        <span className="text-sm text-black/60">
          / {formatTokens(limit)} tokens
        </span>
      </div>
      <Progress
        percent={pct}
        strokeColor={strokeColor}
        styles={{
          rail: { background: "color-mix(in srgb, var(--accent) 14%, white)" },
        }}
        showInfo={true}
        size={["100%", 10]}
        format={(p) => (
          <span className="text-xs text-(--text-main) opacity-60">{p}%</span>
        )}
      />
    </section>
  );
}

const DAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

export default function TokenUsageView({ userId }: { userId?: string }): React.ReactElement {
  const [data, setData] = useState<TokenUsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetch = userId ? getAdminUserTokenUsage(userId) : getTokenUsage();
    fetch
      .then((d) => setData(d))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [userId]);

  const hourlyChartItems: UsageChartDatum[] = (
    data?.last_12_hours.hourly ?? []
  ).map((item, index) => {
    const date = new Date(item.timestamp);
    return {
      axisLabel: index % 3 === 0 ? localHourFormatter.format(date) : "",
      label: localDateTimeFormatter.format(date),
      tokens: item.tokens,
    };
  });

  const weeklyChartItems: UsageChartDatum[] = data
    ? data.week.daily.map((item) => {
        const date = new Date(`${item.date}T00:00:00Z`);
        const dayLabel = DAY_LABELS[date.getUTCDay()];
        return {
          axisLabel: dayLabel,
          label: `${item.date.replace(/-/g, "/")}（${dayLabel}）`,
          tokens: item.tokens,
        };
      })
    : [];

  const monthlyChartItems: UsageChartDatum[] = data
    ? data.months.monthly.map((item) => {
        const [year, month] = item.month.split("-");
        const monthNumber = Number(month);
        return {
          axisLabel: `${monthNumber}月`,
          label: `${year}年${monthNumber}月`,
          tokens: item.tokens,
        };
      })
    : [];

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

        {data && userId && (
          <div className="flex flex-col gap-10">
            <section>
              <SectionHeader label="近12小時" total={data.last_12_hours.total} />
              <UsageBarChart
                items={hourlyChartItems}
                description="近12小時 Token 使用量（當地時間）"
              />
            </section>

            <section>
              <SectionHeader label="本週" total={data.week.total} />
              <UsageBarChart
                items={weeklyChartItems}
                description="本週每日 Token 使用量"
              />
            </section>

            <section>
              <SectionHeader label="近三個月" total={data.months.total} />
              <UsageBarChart
                items={monthlyChartItems}
                description="近三個月每月 Token 使用量"
              />
            </section>
          </div>
        )}

        {data && !userId && (
          <div className="flex flex-col gap-8">
            <UsageProgressSection
              label="近12小時"
              total={data.last_12_hours.total}
              limit={LIMITS.last12h}
            />
            <UsageProgressSection
              label="本月"
              total={
                data.months.monthly.find(
                  (m) => m.month === new Date().toISOString().slice(0, 7)
                )?.tokens ?? 0
              }
              limit={LIMITS.month}
            />
          </div>
        )}
      </div>
    </div>
  );
}
