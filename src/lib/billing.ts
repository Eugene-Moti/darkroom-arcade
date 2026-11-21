import type { Session, Settings } from "./types";
import { duration } from "./format";
import { memberNet } from "./membership";

/**
 * Mirrors the billing functions in supabase/schema.sql (billable_minutes,
 * booked_price, end_session). The database is the source of truth for every
 * amount charged; these are used for live previews while a session runs.
 */

type BillingRules = Pick<Settings, "minimum_minutes" | "grace_minutes" | "billing_increment_minutes">;

/** Seconds of actual play (excludes paused time). `now` is server-corrected ms. */
export function elapsedSeconds(s: Session, now: number): number {
  const start = Date.parse(s.started_at);
  const end = s.ended_at ? Date.parse(s.ended_at) : now;
  const livePause = s.paused_at && !s.ended_at ? (now - Date.parse(s.paused_at)) / 1000 : 0;
  return Math.max(0, (end - start) / 1000 - s.paused_seconds - livePause);
}

export function billableMinutes(played: number, st: BillingRules) {
  const inc = Math.max(1, st.billing_increment_minutes);
  return Math.max(st.minimum_minutes, Math.ceil(Math.max(played - st.grace_minutes, 0) / inc) * inc);
}

export function priceFor(minutes: number, hourlyRate: number) {
  return Math.round(hourlyRate * minutes / 60 * 100) / 100;
}

/** What a block of booked time costs (public.booked_price). */
export function bookedPrice(minutes: number, hourlyRate: number, st: BillingRules) {
  return priceFor(billableMinutes(minutes, st), hourlyRate);
}

/** Live estimate of what the customer owes right now (mirrors end_session). */
export function liveBill(s: Session, now: number, st: Settings) {
  const played = Math.floor(elapsedSeconds(s, now) / 60);
  let billed = billableMinutes(played, st);
  if (st.charge_booked_time && s.planned_minutes) billed = Math.max(billed, billableMinutes(s.planned_minutes, st));
  const gross = priceFor(billed, Number(s.hourly_rate));
  const amount = memberNet(gross, s.member_discount_pct ?? 0);
  const prepaid = Number(s.prepaid_amount ?? 0);
  return { played, billed, gross, memberDiscount: Math.round((gross - amount) * 100) / 100, amount, prepaid, balance: Math.round((amount - prepaid) * 100) / 100 };
}

/** Booked minutes once `add` more minutes are added (mirrors extend_session). */
export function plannedAfter(s: Session, add: number, now: number) {
  return (s.planned_minutes ?? Math.floor(elapsedSeconds(s, now) / 60)) + add;
}

/** Money to collect now so all booked time is paid for (mirrors extend_session). */
export function topUpFor(s: Session, add: number, now: number, st: Settings) {
  const due = memberNet(bookedPrice(plannedAfter(s, add, now), Number(s.hourly_rate), st), s.member_discount_pct ?? 0) - Number(s.prepaid_amount ?? 0);
  return Math.max(0, Math.round(due * 100) / 100);
}

/**
 * When booked time runs out (epoch ms), pushed back by any pauses.
 * Null for open time. Pass `now` to include a pause that is still running.
 */
export function endsAt(s: Session, now?: number): number | null {
  if (!s.planned_minutes) return null;
  const livePause = s.paused_at && !s.ended_at && now ? now - Date.parse(s.paused_at) : 0;
  return Date.parse(s.started_at) + s.planned_minutes * 60_000 + s.paused_seconds * 1000 + livePause;
}

/** Booking lengths offered when starting a session, in minutes. */
export function bookingOptions(st: Settings) {
  const inc = st.billing_increment_minutes;
  const base = inc >= 60 ? [60, 120, 180, 240, 300] : [30, 60, 90, 120, 180];
  return base.filter((m) => m >= Math.min(st.minimum_minutes, 60));
}

/** Quick "add time" choices, in minutes. Per-hour shops get +1h / +2h / +3h. */
export function extendOptions(st: Settings) {
  return st.billing_increment_minutes >= 60 ? [60, 120, 180] : [30, 60, 120];
}

export function hoursLabel(minutes: number) {
  if (minutes % 60 === 0) return `${minutes / 60} hr${minutes === 60 ? "" : "s"}`;
  if (minutes === 90) return "1½ hrs";
  return duration(minutes);
}

export type TimerState = "running" | "warning" | "overtime" | "paused" | "open";

export function timerState(s: Session, now: number, st: Settings): TimerState {
  if (s.status === "paused") return "paused";
  if (!s.planned_minutes) return "open";
  const remaining = s.planned_minutes * 60 - elapsedSeconds(s, now);
  if (remaining <= 0) return "overtime";
  if (remaining <= st.warn_before_minutes * 60) return "warning";
  return "running";
}
