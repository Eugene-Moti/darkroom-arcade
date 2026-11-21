import { hms, money, prettyDate, ymd } from "@/lib/format";
import { describeOffer, liveOffers, memberNet, planLength } from "@/lib/membership";
import { PAYMENT_LABELS, type Member, type MemberOffer, type MembershipPlan, type MembershipSale, type Settings } from "@/lib/types";
import { useArcadeOptional } from "./arcade-provider";
import { Barcode } from "./barcode";
import { Emblem } from "./emblem";

const Rule = () => <div className="my-2 border-t border-dashed border-black/50" />;
function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-[1.5px] ${strong ? "font-bold" : ""}`}>
      <span className="shrink-0">{label}</span>
      <span className="text-right font-semibold">{value}</span>
    </div>
  );
}

/** Benefits a member on `planId` gets: plan discount, matching offers and perks. */
export function memberBenefits(planId: string | null, plans: MembershipPlan[], offers: MemberOffer[]) {
  const plan = plans.find((p) => p.id === planId);
  const list: string[] = [];
  if (plan?.discount_pct) list.push(`${plan.discount_pct}% off every hour you play`);
  if (plan?.description) list.push(plan.description);
  liveOffers(offers, ymd(new Date()))
    .filter((o) => !o.plan_id || o.plan_id === planId)
    .forEach((o) => list.push(o.kind === "perk" ? o.title + (o.description ? ` (${o.description})` : "") : `${o.title}: ${describeOffer(o, plans, false)}`));
  return list;
}

/** Printed when a member joins or renews: payment receipt + member card. */
export function MembershipReceipt({
  member: m, sale, settings, copy,
}: { member: Member; sale: MembershipSale | null; settings: Settings; copy?: "CUSTOMER COPY" | "SHOP COPY" }) {
  const ctx = useArcadeOptional();
  const benefits = ctx ? memberBenefits(m.plan_id, ctx.plans, ctx.offers) : [];
  const cur = settings.currency;
  return (
    <div className="paper receipt-print relative px-4 py-4 text-[12.5px] leading-snug">
      <div className="flex flex-col items-center text-center">
        <Emblem size={46} mono />
        <p className="mt-1.5 text-[15px] font-black uppercase tracking-wide">{settings.shop_name}</p>
        {settings.tagline && <p className="text-[11px]">{settings.tagline}</p>}
        {(settings.location || settings.phone) && <p className="text-[11px]">{[settings.location, settings.phone].filter(Boolean).join(" · ")}</p>}
        <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.2em]">{sale ? (sale.kind === "renew" ? "Membership renewal" : "Membership receipt") : "Member card"}</p>
        {copy && <p className="mt-1 bg-black px-2 py-[1px] text-[10px] font-bold tracking-[0.25em] text-white">{copy}</p>}
      </div>

      <Rule />
      {sale?.receipt_code && <Row label="Receipt ID" value={sale.receipt_code} strong />}
      <Row label="Date" value={`${ymd(sale?.created_at ?? new Date())} ${hms(sale?.created_at ?? new Date())}`} />
      <Row label="Member" value={m.full_name} />
      {m.phone && <Row label="Phone" value={m.phone} />}

      <div className="my-2 border-2 border-black px-2 py-1.5 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.25em]">Member No.</p>
        <p className="text-[24px] font-black tracking-[0.15em]">{m.member_no}</p>
        {sale ? (
          <p className="text-[11px] font-semibold">{sale.plan_name} · valid until {prettyDate(sale.period_end).replace(/^\w+, /, "")}</p>
        ) : m.expires_at ? (
          <p className="text-[11px] font-semibold">Valid until {prettyDate(m.expires_at).replace(/^\w+, /, "")}</p>
        ) : null}
      </div>

      {sale && (
        <>
          <Row label="Plan" value={sale.plan_name} />
          <Row label="Starts" value={ymd(sale.period_start)} />
          <Row label="Ends" value={ymd(sale.period_end)} strong />
          <div className="mt-1.5 flex items-baseline justify-between border-y-2 border-black py-1.5">
            <span className="text-[13px] font-black uppercase">Paid</span>
            <span className="text-[18px] font-black">{money(sale.amount, cur)}</span>
          </div>
          {sale.method && <Row label="Paid via" value={PAYMENT_LABELS[sale.method]} />}
          {sale.staff_name && <Row label="Served by" value={sale.staff_name} />}
        </>
      )}

      {benefits.length > 0 && (
        <>
          <Rule />
          <p className="text-[11px] font-black uppercase tracking-[0.2em]">Your member benefits</p>
          <ul className="mt-1 space-y-0.5">
            {benefits.map((b) => <li key={b} className="flex gap-1.5"><span>★</span><span>{b}</span></li>)}
          </ul>
        </>
      )}

      <Rule />
      <div className="mx-auto w-[80%]"><Barcode value={m.member_no} height={40} /></div>
      <p className="mt-0.5 text-center font-mono text-[11px] tracking-[0.3em]">{m.member_no}</p>
      <p className="mt-2 text-center text-[11.5px] font-bold">Show your member number at the desk to get your member price.</p>
      {settings.receipt_footer && <p className="mt-3 text-center text-[12.5px] font-bold">{settings.receipt_footer}</p>}
      <p className="mt-2 text-center text-[9px] text-black/60">Printed {new Date().toLocaleString("en-GB")}</p>
    </div>
  );
}

/**
 * "Become a member" box printed on walk-in receipts. Lists the plans and perks
 * and, on a paid receipt, how much the customer would have saved today.
 */
export function MembershipPitch({ amount }: { amount?: number | null }) {
  const ctx = useArcadeOptional();
  if (!ctx?.settings?.receipt_show_membership) return null;
  const plans = ctx.plans.filter((p) => p.is_active);
  if (!plans.length) return null;
  const cur = ctx.settings.currency;
  const best = plans.reduce((a, b) => (b.discount_pct > a.discount_pct ? b : a), plans[0]);
  const saved = amount && best.discount_pct ? amount - memberNet(amount, best.discount_pct) : 0;
  const perks = liveOffers(ctx.offers, ymd(new Date())).filter((o) => !o.plan_id).slice(0, 3);
  return (
    <div className="mt-3 border-2 border-dashed border-black px-2.5 py-2">
      <p className="text-center text-[12px] font-black uppercase tracking-[0.2em]">★ Become a member ★</p>
      {ctx.settings.membership_pitch && <p className="mt-1 text-center text-[11px]">{ctx.settings.membership_pitch}</p>}
      <div className="mt-1.5 space-y-0.5 text-[11px]">
        {plans.slice(0, 4).map((p) => (
          <div key={p.id} className="flex items-baseline justify-between gap-2">
            <span className="font-bold">{p.name} <span className="font-normal">({planLength(p.duration_days)})</span></span>
            <span className="text-right">{money(p.price, cur)}{p.discount_pct ? ` · ${p.discount_pct}% off` : ""}</span>
          </div>
        ))}
      </div>
      {perks.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-[11px]">
          {perks.map((o) => <li key={o.id}>★ {o.kind === "perk" ? o.title : `${o.title}: ${describeOffer(o, ctx.plans, false)}`}</li>)}
        </ul>
      )}
      {saved > 0 && (
        <p className="mt-1.5 text-center text-[11.5px] font-bold">As a {best.name} member you would have saved {money(saved, cur)} today!</p>
      )}
    </div>
  );
}
