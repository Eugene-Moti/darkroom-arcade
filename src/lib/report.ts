import type { MembershipSale, PaymentMethod, Session, SessionEvent } from "./types";
import { elapsedSeconds, endsAt } from "./billing";
import { duration, hms, ymd } from "./format";

export interface Bucket {
  key: string;
  sessions: number;
  minutes: number;
  revenue: number;
}

function bump(map: Map<string, Bucket>, key: string, s: Session, mins: number) {
  const b = map.get(key) ?? { key, sessions: 0, minutes: 0, revenue: 0 };
  b.sessions += 1;
  b.minutes += mins;
  b.revenue += s.status === "completed" ? Number(s.amount ?? 0) : 0;
  map.set(key, b);
}

/**
 * Build the day's numbers. `events` are the day's payment/refund events: when
 * given, cash-up counts money actually received (upfront, added time, checkout,
 * refunds) rather than session totals.
 */
export function buildDailyReport(all: Session[], now: number, events?: SessionEvent[], sales: MembershipSale[] = []) {
  const counted = all.filter((s) => s.status !== "cancelled");
  const paid = all.filter((s) => s.status === "completed");
  const voided = all.filter((s) => s.status === "cancelled");
  const live = all.filter((s) => s.status === "active" || s.status === "paused");
  const minsOf = (s: Session) => s.played_minutes ?? Math.floor(elapsedSeconds(s, now) / 60);

  const revenue = paid.reduce((a, s) => a + Number(s.amount ?? 0), 0);
  const gross = paid.reduce((a, s) => a + Number(s.gross_amount ?? 0), 0);
  const discounts = paid.reduce((a, s) => a + Number(s.discount ?? 0), 0);
  const minutes = counted.reduce((a, s) => a + minsOf(s), 0);

  const hours: Bucket[] = Array.from({ length: 24 }, (_, h) => ({ key: String(h), sessions: 0, minutes: 0, revenue: 0 }));
  const byScreen = new Map<string, Bucket>();
  const byGame = new Map<string, Bucket>();
  const byStaff = new Map<string, Bucket>();
  const byPayment = new Map<PaymentMethod, { count: number; amount: number }>();

  counted.forEach((s) => {
    const m = minsOf(s);
    const h = new Date(s.started_at).getHours();
    hours[h].sessions += 1;
    hours[h].minutes += m;
    hours[h].revenue += s.status === "completed" ? Number(s.amount ?? 0) : 0;
    bump(byScreen, s.screen_code, s, m);
    bump(byGame, s.game_title, s, m);
    bump(byStaff, s.closed_by_name ?? s.staff_name ?? "—", s, m);
    if (!events && s.status === "completed" && s.payment_method) {
      const p = byPayment.get(s.payment_method) ?? { count: 0, amount: 0 };
      p.count += 1;
      p.amount += Number(s.amount ?? 0);
      byPayment.set(s.payment_method, p);
    }
  });

  let received = revenue;
  if (events) {
    received = 0;
    events.forEach((e) => {
      if ((e.kind !== "payment" && e.kind !== "refund") || !e.method) return;
      const p = byPayment.get(e.method) ?? { count: 0, amount: 0 };
      if (e.kind === "payment") p.count += 1;
      p.amount += Number(e.amount ?? 0);
      byPayment.set(e.method, p);
      received += Number(e.amount ?? 0);
    });
  }
  // Membership fees taken today count towards the till
  sales.forEach((sale) => {
    if (!sale.method || !Number(sale.amount)) return;
    const p = byPayment.get(sale.method) ?? { count: 0, amount: 0 };
    p.count += 1;
    p.amount += Number(sale.amount);
    byPayment.set(sale.method, p);
    received += Number(sale.amount);
  });
  const membershipRevenue = sales.reduce((a, s) => a + Number(s.amount ?? 0), 0);
  const memberPaid = paid.filter((s) => s.member_id);
  const members = {
    sessions: counted.filter((s) => s.member_id).length,
    walkins: counted.filter((s) => !s.member_id).length,
    revenue: memberPaid.reduce((a, s) => a + Number(s.amount ?? 0), 0),
    walkinRevenue: paid.filter((s) => !s.member_id).reduce((a, s) => a + Number(s.amount ?? 0), 0),
    discounts: memberPaid.reduce((a, s) => a + Number(s.member_discount ?? 0), 0),
    joins: sales.filter((s) => s.kind === "join").length,
    renewals: sales.filter((s) => s.kind === "renew").length,
    membershipRevenue,
  };
  const extendedMinutes = counted.reduce((a, s) => a + (s.extended_minutes ?? 0), 0);
  const extendedSessions = counted.filter((s) => (s.extended_minutes ?? 0) > 0).length;
  const prepaidLive = live.reduce((a, s) => a + Number(s.prepaid_amount ?? 0), 0);

  const peak = hours.reduce((a, b) => (b.sessions > a.sessions ? b : a), hours[0]);
  const sortDesc = (m: Map<string, Bucket>) => [...m.values()].sort((a, b) => b.revenue - a.revenue || b.sessions - a.sessions);

  return {
    sessions: counted.length,
    paidCount: paid.length,
    liveCount: live.length,
    voidCount: voided.length,
    revenue,
    gross,
    discounts,
    minutes,
    avgMinutes: counted.length ? Math.round(minutes / counted.length) : 0,
    avgTicket: paid.length ? revenue / paid.length : 0,
    hours,
    peakHour: peak.sessions ? Number(peak.key) : null,
    byScreen: [...byScreen.values()].sort((a, b) => a.key.localeCompare(b.key)),
    byGame: sortDesc(byGame),
    byStaff: sortDesc(byStaff),
    byPayment,
    /** Money in the till for the day (payments − refunds) */
    received,
    /** Money already taken for sessions still playing */
    prepaidLive,
    extendedMinutes,
    extendedSessions,
    members,
  };
}

export type DailyReport = ReturnType<typeof buildDailyReport>;

export function hourLabel(h: number) {
  return `${String(h).padStart(2, "0")}:00`;
}

/* ------------------------------------------------------------------ */
function csvCell(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function sessionsToCsv(rows: Session[]) {
  const head = [
    "Receipt ID", "Date", "Status", "Screen", "Console", "Game", "Team Code", "Players", "Customer", "Phone",
    "Start", "Booked until", "End", "Booked", "Added", "Played (min)", "Billed (min)", "Rate/hr", "Subtotal", "Discount", "Amount",
    "Member No", "Member", "Plan", "Member %", "Member discount", "Prepaid", "Payment", "Opened by", "Closed by", "Notes", "Void reason",
  ];
  const lines = rows.map((s) => [
    s.receipt_code, ymd(s.started_at), s.status, s.screen_code, s.console, s.game_title, s.team_code, s.players,
    s.customer_name, s.customer_phone, hms(s.started_at), endsAt(s) ? hms(new Date(endsAt(s)!)) : "",
    s.ended_at ? hms(s.ended_at) : "", s.planned_minutes ? duration(s.planned_minutes) : "Open",
    s.extended_minutes ? duration(s.extended_minutes) : "", s.played_minutes, s.billed_minutes, s.hourly_rate,
    s.gross_amount, s.discount, s.amount, s.member_no, s.member_name, s.member_plan, s.member_discount_pct || "",
    s.member_discount || "", s.prepaid_amount, s.payment_method, s.staff_name, s.closed_by_name, s.notes, s.cancel_reason,
  ].map(csvCell).join(","));
  return [head.join(","), ...lines].join("\r\n");
}

export function downloadFile(name: string, content: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob(["﻿" + content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
