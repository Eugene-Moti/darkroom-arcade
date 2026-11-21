export function pad(n: number) {
  return String(Math.floor(n)).padStart(2, "0");
}

/** 3725 -> "01:02:05" */
export function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}`;
}

/** 95 -> "1h 35m" */
export function duration(minutes: number | null | undefined) {
  if (minutes == null) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function money(amount: number | null | undefined, currency = "KES") {
  const v = Number(amount ?? 0);
  return `${currency} ${v.toLocaleString("en-US", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

/** Local YYYY-MM-DD */
export function ymd(d: Date | string) {
  const x = typeof d === "string" ? new Date(d) : d;
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

/** 24h HH:MM:SS like the paper receipts */
export function hms(d: Date | string | null | undefined) {
  if (!d) return "—";
  const x = typeof d === "string" ? new Date(d) : d;
  return `${pad(x.getHours())}:${pad(x.getMinutes())}:${pad(x.getSeconds())}`;
}

export function hm(d: Date | string | null | undefined) {
  if (!d) return "—";
  const x = typeof d === "string" ? new Date(d) : d;
  return `${pad(x.getHours())}:${pad(x.getMinutes())}`;
}

export function prettyDate(d: Date | string) {
  const x = typeof d === "string" ? new Date(d.length === 10 ? d + "T00:00:00" : d) : d;
  return x.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/** Local-day [start, end) as ISO strings for querying timestamptz columns. */
export function dayRange(day: string) {
  const start = new Date(day + "T00:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

export function errorMessage(e: unknown) {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return "Something went wrong";
}

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}
