import type { DailyReport } from "@/lib/report";
import { hourLabel } from "@/lib/report";
import { duration, hm, money, prettyDate } from "@/lib/format";
import { PAYMENT_LABELS, type Session, type Settings } from "@/lib/types";
import { Emblem } from "./emblem";

const Rule = () => <div className="my-2 border-t border-dashed border-black/50" />;
const Row = ({ l, r, b }: { l: React.ReactNode; r: React.ReactNode; b?: boolean }) => (
  <div className={`flex justify-between gap-2 py-[1px] ${b ? "font-bold" : ""}`}>
    <span>{l}</span>
    <span className="text-right">{r}</span>
  </div>
);
const H = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-1 mt-3 text-[11px] font-black uppercase tracking-[0.2em]">{children}</p>
);

/** End-of-day "Z report" sized for thermal paper. */
export function ZReport({ day, report: r, sessions, settings, by }: { day: string; report: DailyReport; sessions: Session[]; settings: Settings; by?: string | null }) {
  const cur = settings.currency;
  return (
    <div className="paper receipt-print px-4 py-4 text-[12px] leading-snug">
      <div className="flex flex-col items-center text-center">
        <Emblem size={40} mono />
        <p className="mt-1 text-[15px] font-black uppercase">{settings.shop_name}</p>
        <p className="text-[11px] font-bold uppercase tracking-[0.25em]">Daily report</p>
        <p className="text-[11px]">{prettyDate(day)}</p>
      </div>
      <Rule />
      <Row l="Sessions" r={r.sessions} />
      <Row l="Paid / Live / Void" r={`${r.paidCount} / ${r.liveCount} / ${r.voidCount}`} />
      <Row l="Play time" r={duration(r.minutes)} />
      {r.extendedMinutes > 0 && <Row l={`Time added (${r.extendedSessions})`} r={duration(r.extendedMinutes)} />}
      <Row l="Avg session" r={duration(r.avgMinutes)} />
      {r.peakHour != null && <Row l="Busiest hour" r={hourLabel(r.peakHour)} />}
      <Rule />
      <Row l="Gross" r={money(r.gross, cur)} />
      <Row l="Discounts" r={`- ${money(r.discounts, cur)}`} />
      <div className="my-1 flex justify-between border-y-2 border-black py-1 text-[14px] font-black">
        <span>NET TAKINGS</span>
        <span>{money(r.revenue, cur)}</span>
      </div>

      <H>Cash-up (money received)</H>
      {[...r.byPayment.entries()].map(([k, v]) => (
        <Row key={k} l={`${PAYMENT_LABELS[k]} (${v.count})`} r={money(v.amount, cur)} />
      ))}
      {!r.byPayment.size && <p>—</p>}
      <Row l="IN THE TILL" r={money(r.received, cur)} b />
      {r.prepaidLive > 0 && <Row l="  of which prepaid, still playing" r={money(r.prepaidLive, cur)} />}

      <H>Members</H>
      <Row l="Member / walk-in sessions" r={`${r.members.sessions} / ${r.members.walkins}`} />
      <Row l="Member discounts" r={`- ${money(r.members.discounts, cur)}`} />
      <Row l={`New members / renewals`} r={`${r.members.joins} / ${r.members.renewals}`} />
      <Row l="Membership sales" r={money(r.members.membershipRevenue, cur)} />

      <H>By screen</H>
      {r.byScreen.map((b) => (
        <Row key={b.key} l={`Screen ${b.key} · ${b.sessions} · ${duration(b.minutes)}`} r={money(b.revenue, cur)} />
      ))}

      <H>By game</H>
      {r.byGame.map((b) => (
        <Row key={b.key} l={`${b.key} (${b.sessions})`} r={money(b.revenue, cur)} />
      ))}

      <H>Sessions per hour</H>
      {r.hours.map((h, i) => (h.sessions ? <Row key={i} l={hourLabel(i)} r={`${h.sessions} · ${money(h.revenue, cur)}`} /> : null))}

      <H>Receipts</H>
      {sessions.map((s) => (
        <div key={s.id} className="flex justify-between gap-1 py-[1px] text-[11px]">
          <span>{s.receipt_code} {s.screen_code} {hm(s.started_at)}-{s.ended_at ? hm(s.ended_at) : "…"}{s.member_no ? ` ★${s.member_no}` : ""}</span>
          <span>{s.status === "cancelled" ? "VOID" : s.status === "completed" ? money(s.amount, "") : "LIVE"}</span>
        </div>
      ))}
      <Rule />
      <p className="text-center text-[10px]">Printed {new Date().toLocaleString("en-GB")}{by ? ` by ${by}` : ""}</p>
      <p className="mt-6 text-center text-[11px]">Signature: ____________________</p>
    </div>
  );
}
