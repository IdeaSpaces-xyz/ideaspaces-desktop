// Relative-time + calendar-day helpers, ported from is_web v2 so the desktop's
// time formatting and timeline buckets match the web exactly.

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

export function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

/** Whole calendar days between two dates (local tz); positive when `then` is in
 *  the past. Calendar boundaries, not 24h windows — "yesterday" is a day name. */
export function calendarDayDiff(now: Date, then: Date): number {
  return Math.round((startOfDay(now).getTime() - startOfDay(then).getTime()) / MS_PER_DAY);
}

/** Compact relative time for list rows. Mirrors is_web v2's formatRelativeTime:
 *  "just now", "5m ago", "2h ago", "yesterday", "3d ago", then a short date.
 *  Future timestamps (clock skew) clamp to "just now". */
export function relativeTime(value: string | number | Date, now: Date = new Date()): string {
  const then = new Date(value);
  const thenMs = then.getTime();
  if (Number.isNaN(thenMs)) return "";

  const diffMs = now.getTime() - thenMs;
  if (diffMs < MS_PER_MINUTE) return "just now";
  if (diffMs < MS_PER_HOUR) return `${Math.round(diffMs / MS_PER_MINUTE)}m ago`;

  // Prefer the day name over an hour count once a calendar boundary is crossed.
  const dayDiff = calendarDayDiff(now, then);
  if (dayDiff === 0) return `${Math.round(diffMs / MS_PER_HOUR)}h ago`;
  if (dayDiff === 1) return "yesterday";
  if (dayDiff < 7) return `${dayDiff}d ago`;

  const sameYear = then.getFullYear() === now.getFullYear();
  return then.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}

export interface TimeBucket<T> {
  key: string;
  label: string;
  items: T[];
}

const MONTH_LABEL = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });

/**
 * Group items into is_web v2's timeline buckets — Today / Yesterday / This week
 * / Earlier this month / per-month ("March 2026") — newest bucket first. Input
 * order is preserved within a bucket, so pass items already sorted newest-first.
 * `getDate` extracts the timestamp to bucket on (a conversation's `updated_at`,
 * a note's last-saved mtime, …). Unparseable dates are skipped.
 */
export function bucketByTime<T>(
  items: T[],
  getDate: (item: T) => string | number | Date,
  now: Date = new Date(),
): TimeBucket<T>[] {
  const order: string[] = [];
  const buckets = new Map<string, TimeBucket<T>>();

  const push = (key: string, label: string, item: T) => {
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { key, label, items: [] };
      buckets.set(key, bucket);
      order.push(key);
    }
    bucket.items.push(item);
  };

  for (const item of items) {
    const then = new Date(getDate(item));
    if (Number.isNaN(then.getTime())) continue;

    const dayDiff = calendarDayDiff(now, then);
    if (dayDiff <= 0) push("today", "Today", item);
    else if (dayDiff === 1) push("yesterday", "Yesterday", item);
    else if (dayDiff < 7) push("this-week", "This week", item);
    else if (then.getFullYear() === now.getFullYear() && then.getMonth() === now.getMonth())
      push("earlier-this-month", "Earlier this month", item);
    else
      push(
        `${then.getFullYear()}-${String(then.getMonth() + 1).padStart(2, "0")}`,
        MONTH_LABEL.format(then),
        item,
      );
  }

  return order.map((key) => buckets.get(key)!);
}
