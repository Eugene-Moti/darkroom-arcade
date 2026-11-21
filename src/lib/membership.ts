import type { Member, MemberOffer, MembershipPlan } from "./types";

/**
 * Membership helpers. Mirrors public.member_net / public.member_benefit in
 * supabase/schema.sql — the server decides the discount that is charged; these
 * power previews (start sheet price, receipts, settings).
 */

/** Amount after a member discount (public.member_net). */
export function memberNet(amount: number, pct: number) {
  return Math.round((amount - Math.round(amount * (pct || 0)) / 100) * 100) / 100;
}

export type MemberState = "active" | "expiring" | "expired" | "no-plan" | "inactive";

export function memberState(m: Member, now: number): MemberState {
  if (!m.is_active) return "inactive";
  if (!m.expires_at) return "no-plan";
  const left = Date.parse(m.expires_at) - now;
  if (left <= 0) return "expired";
  if (left <= 3 * 86_400_000) return "expiring";
  return "active";
}

export function daysLeft(m: Member, now: number) {
  if (!m.expires_at) return 0;
  return Math.ceil((Date.parse(m.expires_at) - now) / 86_400_000);
}

export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Weekday, date and time in the shop's timezone. */
export function zonedParts(ms: number, tz: string) {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(ms));
  } catch {
    return zonedParts(ms, "UTC");
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    dow: DAY_SHORT.indexOf(get("weekday")),
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

function offerMatches(o: MemberOffer, planId: string | null, ms: number, tz: string) {
  if (!o.is_active || o.kind !== "percent" || !o.discount_pct) return false;
  if (o.plan_id && o.plan_id !== planId) return false;
  const z = zonedParts(ms, tz);
  if (o.valid_from && z.date < o.valid_from) return false;
  if (o.valid_to && z.date > o.valid_to) return false;
  if (o.days && o.days.length && !o.days.includes(z.dow)) return false;
  if (o.start_time && o.end_time) {
    const a = o.start_time.slice(0, 5), b = o.end_time.slice(0, 5);
    const inside = a <= b ? z.time >= a && z.time < b : z.time >= a || z.time < b;
    if (!inside) return false;
  }
  return true;
}

/** Best discount for a member at a moment (public.member_benefit). */
export function benefitFor(m: Member | null, plans: MembershipPlan[], offers: MemberOffer[], ms: number, tz: string) {
  if (!m || !m.is_active || !m.expires_at || Date.parse(m.expires_at) <= ms) return { pct: 0, title: null as string | null };
  const plan = plans.find((p) => p.id === m.plan_id);
  let pct = plan?.discount_pct ?? 0;
  let title: string | null = pct > 0 && plan ? `${plan.name} member` : null;
  for (const o of offers) {
    if (offerMatches(o, m.plan_id, ms, tz) && (o.discount_pct ?? 0) > pct) {
      pct = o.discount_pct!;
      title = o.title;
    }
  }
  return { pct, title };
}

export function planLength(days: number) {
  if (days % 365 === 0) return days === 365 ? "1 year" : `${days / 365} years`;
  if (days % 30 === 0) return days === 30 ? "1 month" : `${days / 30} months`;
  if (days % 7 === 0) return days === 7 ? "1 week" : `${days / 7} weeks`;
  return days === 1 ? "1 day" : `${days} days`;
}

function daysLabel(days: number[] | null) {
  if (!days || !days.length || days.length === 7) return "";
  const sorted = [...days].sort();
  if (sorted.join() === "1,2,3,4,5") return "Mon–Fri";
  if (sorted.join() === "0,6") return "Weekends";
  return sorted.map((d) => DAY_SHORT[d]).join(", ");
}

/** "30% off · Mon–Fri · 10:00–14:00 · until 31 Dec" */
export function describeOffer(o: MemberOffer, plans: MembershipPlan[], withAudience = true) {
  const bits: string[] = [];
  if (o.kind === "percent" && o.discount_pct) bits.push(`${o.discount_pct}% off`);
  const d = daysLabel(o.days);
  if (d) bits.push(d);
  if (o.start_time && o.end_time) bits.push(`${o.start_time.slice(0, 5)}–${o.end_time.slice(0, 5)}`);
  if (o.valid_to) bits.push(`until ${new Date(o.valid_to + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`);
  const plan = o.plan_id ? plans.find((p) => p.id === o.plan_id)?.name : null;
  if (withAudience) bits.push(plan ? `${plan} members` : "all members");
  return bits.join(" · ");
}

/** Offers worth advertising right now (active and not ended). */
export function liveOffers(offers: MemberOffer[], todayYmd: string) {
  return offers.filter((o) => o.is_active && (!o.valid_to || o.valid_to >= todayYmd));
}
