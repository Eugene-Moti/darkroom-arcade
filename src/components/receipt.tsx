import { duration, hms, money, ymd } from "@/lib/format";
import { endsAt, hoursLabel } from "@/lib/billing";
import { memberNet } from "@/lib/membership";
import { PAYMENT_LABELS, type Session, type Settings } from "@/lib/types";
import { Emblem } from "./emblem";
import { Barcode } from "./barcode";
import { MembershipPitch } from "./membership-receipt";

export { Barcode };

export type ReceiptKind = "ticket" | "final";

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-[1.5px] ${strong ? "font-bold" : ""}`}>
      <span className="shrink-0">{label}</span>
      <span className="text-right font-semibold">{value}</span>
    </div>
  );
}

const Rule = () => <div className="my-2 border-t border-dashed border-black/50" />;

/**
 * The printed receipt. Sized in mm-agnostic units so it renders identically in
 * the on-screen printer animation and on 58/80mm thermal paper.
 */
export function Receipt({
  session: s, settings, kind, copy,
}: { session: Session; settings: Settings; kind: ReceiptKind; copy?: "CUSTOMER COPY" | "SHOP COPY" }) {
  const cur = settings.currency;
  const isVoid = s.status === "cancelled";
  const final = kind === "final";
  const end = endsAt(s);
  const prepaid = Number(s.prepaid_amount ?? 0);
  const balance = Number(s.amount ?? 0) - prepaid;
  const booked = s.planned_minutes
    ? `${hoursLabel(s.planned_minutes)}${s.extended_minutes > 0 ? ` (+${hoursLabel(s.extended_minutes)} added)` : ""}`
    : "Open time";
  const isMember = !!s.member_id;
  const pct = s.member_discount_pct ?? 0;
  const memberDisc = Number(s.member_discount ?? 0);
  return (
    <div className="paper receipt-print relative px-4 py-4 text-[12.5px] leading-snug">
      {isVoid && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="-rotate-[24deg] rounded-md border-4 border-black/70 px-3 py-1 text-4xl font-black tracking-widest text-black/70">VOID</span>
        </div>
      )}
      <div className="flex flex-col items-center text-center">
        <Emblem size={46} mono />
        <p className="mt-1.5 text-[15px] font-black uppercase tracking-wide">{settings.shop_name}</p>
        {settings.tagline && <p className="text-[11px]">{settings.tagline}</p>}
        {(settings.location || settings.phone) && (
          <p className="text-[11px]">{[settings.location, settings.phone].filter(Boolean).join(" · ")}</p>
        )}
        <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.2em]">{final ? (isVoid ? "Void receipt" : "Payment receipt") : "Session ticket"}</p>
        {copy && <p className="mt-1 bg-black px-2 py-[1px] text-[10px] font-bold tracking-[0.25em] text-white">{copy}</p>}
      </div>

      <Rule />
      <Row label="Receipt ID" value={s.receipt_code} strong />
      <Row label="Date" value={ymd(s.started_at)} />
      {isMember ? (
        <>
          <div className="my-1.5 flex items-center justify-between bg-black px-2 py-[3px] text-[11px] font-bold tracking-[0.15em] text-white">
            <span>★ MEMBER</span>
            <span>{s.member_no}</span>
          </div>
          <Row label="Member" value={s.member_name} />
          {s.member_plan && (
            <Row label="Plan" value={`${s.member_plan}${s.member_expires_at ? ` · to ${ymd(s.member_expires_at)}` : ""}`} />
          )}
        </>
      ) : (
        <>
          <Row label="Customer" value={s.customer_name ? `${s.customer_name} (walk-in)` : "Walk-in"} />
        </>
      )}
      {s.team_code && s.team_code !== "0" && <Row label="Team Code" value={s.team_code} />}
      <Row label="Screen" value={s.screen_code} strong />
      <Row label="Console" value={s.console} />
      <Row label="Game" value={s.game_title} />
      {s.players > 1 && <Row label="Players" value={s.players} />}
      <Row label="Rate" value={`${money(s.hourly_rate, cur)}/hr`} />
      {isMember && pct > 0 && (
        <Row label="Member rate" value={`${money(memberNet(Number(s.hourly_rate), pct), cur)}/hr (−${pct}%)`} strong />
      )}
      {isMember && s.offer_title && s.offer_title !== `${s.member_plan} member` && <Row label="Offer" value={s.offer_title} />}
      <Row label="Booked" value={booked} />

      {/* Times the customer cares about most */}
      <div className="my-2 border-2 border-black px-2 py-1.5">
        <Row label="Start Time" value={hms(s.started_at)} strong />
        {final ? (
          <>
            {end && <Row label="Booked Until" value={hms(new Date(end))} />}
            <Row label="End Time" value={hms(s.ended_at)} strong />
          </>
        ) : (
          <div className="flex items-baseline justify-between gap-3 pt-[1.5px]">
            <span className="shrink-0 font-bold">Ends At</span>
            <span className="text-[17px] font-black tracking-wide">
              {s.status === "paused" ? "PAUSED" : end ? hms(new Date(end)) : "OPEN"}
            </span>
          </div>
        )}
      </div>

      {!final && !isVoid && (
        prepaid > 0 ? (
          <>
            <Row label="Paid" value={money(prepaid, cur)} strong />
            {s.payment_method && <Row label="Paid via" value={PAYMENT_LABELS[s.payment_method]} />}
            <p className="mt-1 text-center text-[10.5px]">Extra time after {end ? hms(new Date(end)).slice(0, 5) : "your booking"} is charged at {money(s.hourly_rate, cur)}/hr</p>
          </>
        ) : (
          <Row label="Payment" value={s.planned_minutes ? "Pay on exit" : "Per hour, on exit"} />
        )
      )}

      {final && !isVoid && (
        <>
          <Rule />
          <Row label="Played" value={duration(s.played_minutes)} />
          <Row label="Charged" value={duration(s.billed_minutes)} />
          <Row label="Subtotal" value={money(s.gross_amount, cur)} />
          {memberDisc > 0 && <Row label={`Member discount (${pct}%)`} value={`- ${money(memberDisc, cur)}`} />}
          {Number(s.discount) > 0 && <Row label="Discount" value={`- ${money(s.discount, cur)}`} />}
          <div className="mt-1.5 flex items-baseline justify-between border-y-2 border-black py-1.5">
            <span className="text-[13px] font-black uppercase">Total</span>
            <span className="text-[18px] font-black">{money(s.amount, cur)}</span>
          </div>
          {prepaid > 0 && <Row label="Paid upfront" value={money(prepaid, cur)} />}
          {prepaid > 0 && balance > 0 && <Row label="Paid at exit" value={money(balance, cur)} strong />}
          {balance < 0 && <Row label="Refunded" value={money(-balance, cur)} strong />}
          {s.payment_method && <Row label="Paid via" value={PAYMENT_LABELS[s.payment_method]} />}
          {memberDisc > 0 && <p className="mt-1 text-center text-[11px] font-bold">★ You saved {money(memberDisc, cur)} as a member ★</p>}
        </>
      )}
      {final && isVoid && s.cancel_reason && <Row label="Reason" value={s.cancel_reason} />}
      {(s.closed_by_name || s.staff_name) && <Row label="Served by" value={final ? s.closed_by_name ?? s.staff_name : s.staff_name} />}

      <Rule />
      <div className="mx-auto w-[88%]">
        <Barcode value={s.receipt_code} />
      </div>
      <p className="mt-0.5 text-center font-mono text-[11px] tracking-[0.3em]">{s.receipt_code}</p>

      {!final && settings.receipt_note && (
        <p className="mt-3 text-center text-[12px] font-bold">*{settings.receipt_note}*</p>
      )}
      {!isMember && !isVoid && <MembershipPitch amount={final ? Number(s.gross_amount ?? 0) : prepaid || null} />}
      {settings.receipt_footer && <p className="mt-3 text-center text-[12.5px] font-bold">{settings.receipt_footer}</p>}
      <p className="mt-2 text-center text-[9px] text-black/60">Printed {new Date().toLocaleString("en-GB")}</p>
    </div>
  );
}
