// Date formatting for the v2 transcript — transplanted from is_web
// (`pages/v2/conversation/transcript-format.ts`). Kept out of the transcript so
// that file exports only components (Fast Refresh boundary stays clean).

export function formatAbsoluteDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatDay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}
