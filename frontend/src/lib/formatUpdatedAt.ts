import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

const SIX_HOURS_IN_MS = 6 * 60 * 60 * 1000;

export function formatUpdatedAt(value: string | null | undefined): string {
  if (!value) return "";

  const updatedAt = dayjs(value);
  if (!updatedAt.isValid()) return "";

  const now = dayjs();
  const diffMs = Math.abs(now.valueOf() - updatedAt.valueOf());

  if (diffMs <= SIX_HOURS_IN_MS) {
    return updatedAt.fromNow();
  }

  if (updatedAt.isSame(now, "day")) {
    return updatedAt.format("h:mm A");
  }

  return updatedAt.format("YYYY/MM/DD");
}
