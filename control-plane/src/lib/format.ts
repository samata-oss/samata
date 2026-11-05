/** Seconds -> "480 ms". */
export function fmtMs(seconds: number | null | undefined) {
  return seconds == null
    ? "—"
    : `${Math.round(seconds * 1000).toLocaleString()} ms`;
}

/** Seconds -> "2m 14s". */
export function fmtDuration(seconds: number | null | undefined) {
  if (seconds == null) return "—";
  const total = Math.round(seconds);
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

export function fmtDateTime(date: Date | string | null | undefined) {
  if (!date) return "—";
  return new Date(date).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function mean(values: (number | null | undefined)[]) {
  const nums = values.filter((v): v is number => typeof v === "number");
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}
