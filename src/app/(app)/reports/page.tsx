"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  Banknote, CalendarDays, ChevronLeft, ChevronRight, Clock, Download, Flame, Gamepad2, Printer, Receipt, Tag, Timer, Ban,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { useArcade, useNow } from "@/components/arcade-provider";
import { usePrint } from "@/components/print";
import { useToast } from "@/components/toast";
import { HourlyBars, RankBars, Timeline, TrendBars } from "@/components/charts";
import { ZReport } from "@/components/z-report";
import { AnimatedNumber, Button, Stat, StatusPill } from "@/components/ui";
import { buildDailyReport, downloadFile, hourLabel, sessionsToCsv } from "@/lib/report";
import { endsAt } from "@/lib/billing";
import { dayRange, duration, errorMessage, hm, money, prettyDate, ymd } from "@/lib/format";
import { PAYMENT_LABELS, type MembershipSale, type Session, type SessionEvent } from "@/lib/types";

function shift(day: string, n: number) {
  const d = new Date(day + "T00:00:00");
  d.setDate(d.getDate() + n);
  return ymd(d);
}

export default function ReportsPage() {
  const { settings, screens, today, profile, members } = useArcade();
  const now = useNow();
  const toast = useToast();
  const print = usePrint();
  const todayKey = ymd(new Date());
  const [day, setDay] = useState(todayKey);
  const [rows, setRows] = useState<Session[]>([]);
  const [week, setWeek] = useState<Session[]>([]);
  const [loadedDay, setLoadedDay] = useState<string | null>(null);
  const [events, setEvents] = useState<{ day: string; rows: SessionEvent[]; sales: MembershipSale[] } | null>(null);
  const cur = settings?.currency ?? "KES";

  // selected day (today comes live from realtime state)
  useEffect(() => {
    if (day === todayKey) return;
    let off = false;
    const { from, to } = dayRange(day);
    getSupabase().from("sessions").select("*").gte("started_at", from).lt("started_at", to).order("started_at")
      .then(({ data, error }) => {
        if (off) return;
        if (error) toast("error", "Couldn't load report", errorMessage(error));
        setRows((data as Session[]) ?? []);
        setLoadedDay(day);
      });
    return () => { off = true; };
  }, [day, todayKey, toast]);

  // Money received on the selected day (payments & refunds). Refetched as
  // today's sessions change, since every payment also updates its session.
  const todayVersion = day === todayKey ? today : null;
  const membersVersion = day === todayKey ? members : null; // sign-ups/renewals change the till too
  useEffect(() => {
    let off = false;
    const { from, to } = dayRange(day);
    const sb = getSupabase();
    Promise.all([
      sb.from("session_events").select("*").in("kind", ["payment", "refund"]).gte("created_at", from).lt("created_at", to),
      sb.from("membership_sales").select("*").gte("created_at", from).lt("created_at", to),
    ]).then(([ev, ms]) => {
      if (off || ev.error) return;
      setEvents({ day, rows: (ev.data as SessionEvent[]) ?? [], sales: ms.error ? [] : (ms.data as MembershipSale[]) ?? [] });
    });
    return () => { off = true; };
  }, [day, todayVersion, membersVersion]);

  // 7-day trend ending on the selected day
  useEffect(() => {
    const from = dayRange(shift(day, -6)).from;
    const to = dayRange(day).to;
    getSupabase().from("sessions").select("id,started_at,status,amount").gte("started_at", from).lt("started_at", to)
      .then(({ data }) => setWeek((data as Session[]) ?? []));
  }, [day]);

  const sessions = useMemo(
    () => (day === todayKey ? [...today].sort((a, b) => a.started_at.localeCompare(b.started_at)) : rows),
    [day, todayKey, today, rows],
  );
  const isLoading = day !== todayKey && loadedDay !== day;
  const dayEvents = events?.day === day ? events.rows : undefined;
  const daySales = events?.day === day ? events.sales : undefined;
  const r = useMemo(() => buildDailyReport(sessions, now, dayEvents, daySales), [sessions, now, dayEvents, daySales]);

  const trend = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = shift(day, i - 6);
      const list = (d === todayKey ? today : week).filter((s) => ymd(s.started_at) === d && s.status !== "cancelled");
      return {
        day: d,
        label: new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" }),
        revenue: list.filter((s) => s.status === "completed").reduce((a, s) => a + Number(s.amount ?? 0), 0),
        sessions: list.length,
      };
    });
  }, [day, todayKey, today, week]);

  function exportCsv() {
    downloadFile(`darkroom-receipts-${day}.csv`, sessionsToCsv(sessions));
  }
  function printZ() {
    if (!settings) return;
    print([<ZReport key="z" day={day} report={r} sessions={sessions} settings={settings} by={profile?.full_name} />]);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.25em] text-brand">Daily report</p>
          <h1 className="mt-1 font-display text-3xl font-bold sm:text-4xl">{prettyDate(day)}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl border border-line bg-panel/80">
            <button onClick={() => setDay(shift(day, -1))} className="grid size-11 place-items-center text-muted hover:text-white" aria-label="Previous day"><ChevronLeft className="size-5" /></button>
            <label className="relative flex h-11 items-center gap-2 border-x border-line px-3 text-sm font-medium">
              <CalendarDays className="size-4 text-brand" />
              <input type="date" value={day} max={todayKey} onChange={(e) => e.target.value && setDay(e.target.value)} className="bg-transparent text-white outline-none" />
            </label>
            <button onClick={() => setDay(shift(day, 1))} disabled={day >= todayKey} className="grid size-11 place-items-center text-muted hover:text-white disabled:opacity-30" aria-label="Next day"><ChevronRight className="size-5" /></button>
          </div>
          {day !== todayKey && <Button variant="ghost" onClick={() => setDay(todayKey)}>Today</Button>}
          <Button variant="outline" icon={<Download className="size-4" />} onClick={exportCsv} disabled={!sessions.length}>CSV</Button>
          <Button icon={<Printer className="size-4" />} onClick={printZ} disabled={!settings}>Print Z-report</Button>
        </div>
      </header>

      <motion.div key={day} initial={{ opacity: 0 }} animate={{ opacity: isLoading ? 0.4 : 1 }} className="space-y-6">
        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
          <Stat accent label="Net takings" icon={<Banknote className="size-4" />} value={<AnimatedNumber value={r.revenue} format={(n) => money(Math.round(n), cur)} />} sub={r.discounts ? `${money(r.discounts, cur)} discounts` : "no discounts"} />
          <Stat label="Sessions" icon={<Gamepad2 className="size-4" />} value={<AnimatedNumber value={r.sessions} />} sub={`${r.paidCount} paid · ${r.liveCount} live`} />
          <Stat label="Play time" icon={<Clock className="size-4" />} value={duration(r.minutes)} sub={r.extendedMinutes ? `incl. ${duration(r.extendedMinutes)} added` : "all screens"} />
          <Stat label="Avg session" icon={<Timer className="size-4" />} value={duration(r.avgMinutes)} sub="per receipt" />
          <Stat label="Avg ticket" icon={<Tag className="size-4" />} value={<AnimatedNumber value={r.avgTicket} format={(n) => money(Math.round(n), cur)} />} sub="per paid session" />
          <Stat label="Busiest hour" icon={<Flame className="size-4" />} value={r.peakHour != null ? hourLabel(r.peakHour) : "—"} sub={r.voidCount ? `${r.voidCount} voided` : "no voids"} />
        </section>

        <div className="grid gap-6 xl:grid-cols-5">
          <Panel className="xl:col-span-3" title="Sessions started per hour" sub="When games were played — hover a bar for detail">
            <HourlyBars hours={r.hours} currency={cur} peak={r.peakHour} />
          </Panel>
          <Panel className="xl:col-span-2" title="Last 7 days" sub="Net takings — tap a day to open it">
            <TrendBars days={trend} currency={cur} selected={day} onSelect={setDay} />
          </Panel>
        </div>

        <Panel title="Screen occupancy" sub="Every session on every screen across the day">
          {sessions.length ? (
            <Timeline sessions={sessions} screens={screens.map((s) => s.code)} now={now} currency={cur} />
          ) : (
            <p className="py-8 text-center text-sm text-faint">No sessions on this day.</p>
          )}
        </Panel>

        <div className="grid gap-6 lg:grid-cols-3">
          <Panel title="By screen"><RankBars rows={[...r.byScreen].sort((a, b) => b.revenue - a.revenue).map((b) => ({ ...b, key: `Screen ${b.key}` }))} currency={cur} /></Panel>
          <Panel title="By game"><RankBars rows={r.byGame} currency={cur} metric="sessions" /></Panel>
          <Panel title="Cash-up" sub="Money received today: sessions (incl. upfront & refunds) and membership fees">
            <ul className="space-y-2">
              {(["cash", "mpesa", "card", "other"] as const).map((k) => {
                const v = r.byPayment.get(k);
                return (
                  <li key={k} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3.5 py-2.5 text-sm">
                    <span className="text-muted">{PAYMENT_LABELS[k]} <span className="text-faint">· {v?.count ?? 0}</span></span>
                    <span className="font-semibold tabular-nums">{money(v?.amount ?? 0, cur)}</span>
                  </li>
                );
              })}
              <li className="flex items-center justify-between rounded-xl border border-brand/30 bg-brand/[0.06] px-3.5 py-2.5 text-sm">
                <span className="font-semibold text-white">In the till</span>
                <span className="font-display text-lg font-bold text-brand tabular-nums">{money(r.received, cur)}</span>
              </li>
            </ul>
            {(r.prepaidLive > 0 || r.extendedSessions > 0) && (
              <div className="mt-3 space-y-1 text-xs text-faint">
                {r.prepaidLive > 0 && <p>{money(r.prepaidLive, cur)} of this is prepaid for sessions still playing.</p>}
                {r.extendedSessions > 0 && <p>{r.extendedSessions} session{r.extendedSessions > 1 ? "s" : ""} added time ({duration(r.extendedMinutes)} in total).</p>}
              </div>
            )}
            {r.byStaff.length > 0 && (
              <>
                <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-faint">By staff</p>
                <ul className="space-y-1.5 text-sm">
                  {r.byStaff.map((b) => (
                    <li key={b.key} className="flex justify-between"><span className="text-muted">{b.key} · {b.sessions}</span><span className="tabular-nums">{money(b.revenue, cur)}</span></li>
                  ))}
                </ul>
              </>
            )}
          </Panel>
        </div>

        <Panel title="Members vs walk-ins" sub="Who played today, what they paid, and membership sales">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { k: "Member sessions", v: String(r.members.sessions), sub: `${money(r.members.revenue, cur)} paid · ${money(r.members.discounts, cur)} member discounts` },
              { k: "Walk-in sessions", v: String(r.members.walkins), sub: `${money(r.members.walkinRevenue, cur)} paid` },
              { k: "New members", v: String(r.members.joins), sub: `${r.members.renewals} renewal${r.members.renewals === 1 ? "" : "s"}` },
              { k: "Membership sales", v: money(r.members.membershipRevenue, cur), sub: "included in the cash-up" },
            ].map((x) => (
              <div key={x.k} className="rounded-2xl border border-line bg-white/[0.02] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-faint">{x.k}</p>
                <p className="mt-1 font-display text-2xl font-bold tabular-nums">{x.v}</p>
                <p className="text-xs text-muted">{x.sub}</p>
              </div>
            ))}
          </div>
          {r.sessions > 0 && (
            <div className="mt-4">
              <div className="flex h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
                <motion.div className="h-full bg-brand" initial={{ width: 0 }} animate={{ width: `${(r.members.sessions / r.sessions) * 100}%` }} transition={{ duration: 0.8 }} />
              </div>
              <p className="mt-1.5 text-xs text-muted">{Math.round((r.members.sessions / r.sessions) * 100)}% of sessions were members</p>
            </div>
          )}
        </Panel>

        <Panel title={`Receipts (${sessions.length})`} sub="Table view of every session on this day">
          <div className="-mx-5 overflow-x-auto sm:-mx-6">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-faint">
                <tr className="border-b border-line">
                  {["Receipt", "Screen", "Game", "Team", "Start", "Booked until", "End", "Played", "Payment", "Status", "Amount"].map((h) => (
                    <th key={h} className={`px-3 py-2.5 font-semibold first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6 ${h === "Amount" ? "text-right" : ""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-white/[0.02]">
                    <td className="px-3 py-2.5 pl-5 font-mono text-xs sm:pl-6">{s.receipt_code}</td>
                    <td className="px-3 py-2.5 font-display font-bold text-brand">{s.screen_code}</td>
                    <td className="px-3 py-2.5">{s.game_title}{s.member_id && <span className="ml-1.5 text-xs text-brand" title={s.member_name ?? ""}>★ {s.member_no}</span>}</td>
                    <td className="px-3 py-2.5 text-muted">{s.team_code}</td>
                    <td className="px-3 py-2.5 tabular-nums text-muted">{hm(s.started_at)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-muted">{endsAt(s) ? hm(new Date(endsAt(s)!)) : "Open"}{s.extended_minutes > 0 && <span className="ml-1 text-xs text-brand">+{duration(s.extended_minutes)}</span>}</td>
                    <td className="px-3 py-2.5 tabular-nums text-muted">{s.ended_at ? hm(s.ended_at) : "—"}</td>
                    <td className="px-3 py-2.5 tabular-nums text-muted">{duration(s.played_minutes)}</td>
                    <td className="px-3 py-2.5 text-muted">{s.payment_method ? PAYMENT_LABELS[s.payment_method] : "—"}</td>
                    <td className="px-3 py-2.5"><StatusPill status={s.status} /></td>
                    <td className="px-3 py-2.5 pr-5 text-right font-semibold tabular-nums sm:pr-6">{s.status === "completed" ? money(s.amount, cur) : s.status === "cancelled" ? <Ban className="ml-auto size-4 text-bad" /> : "…"}</td>
                  </tr>
                ))}
                {!sessions.length && (
                  <tr><td colSpan={11} className="py-10 text-center text-faint"><Receipt className="mx-auto mb-2 size-6" />No receipts</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </motion.div>
    </div>
  );
}

function Panel({ title, sub, children, className = "" }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl border border-line bg-panel/80 p-5 sm:p-6 ${className}`}>
      <h2 className="font-display text-lg font-bold">{title}</h2>
      {sub && <p className="mb-5 text-sm text-muted">{sub}</p>}
      {!sub && <div className="mb-4" />}
      {children}
    </section>
  );
}
