"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight, ArrowRightLeft, Ban, Banknote, CalendarClock, ChevronDown, CreditCard, Crown, Footprints, Gamepad2, Minus, Pause,
  Play, Plus, Printer, ShieldAlert, Smartphone, TimerReset, Wallet,
} from "lucide-react";
import type { Member, PaymentMethod, Screen, Session, Settings } from "@/lib/types";
import { benefitFor, memberNet, memberState } from "@/lib/membership";
import { MemberPicker } from "./member-ui";
import {
  bookedPrice, bookingOptions, elapsedSeconds, endsAt, extendOptions, hoursLabel, liveBill, plannedAfter, topUpFor,
} from "@/lib/billing";
import { clock, cn, duration, errorMessage, hm, money } from "@/lib/format";
import { playCoin, playStart } from "@/lib/sound";
import { useArcade, useNow } from "./arcade-provider";
import { useToast } from "./toast";
import { Button, Chips, Field, Input, Sheet, ToggleRow } from "./ui";

const PAYMENTS: { value: PaymentMethod; label: React.ReactNode }[] = [
  { value: "cash", label: <span className="inline-flex items-center gap-1.5"><Banknote className="size-4" />Cash</span> },
  { value: "mpesa", label: <span className="inline-flex items-center gap-1.5"><Smartphone className="size-4" />M-Pesa</span> },
  { value: "card", label: <span className="inline-flex items-center gap-1.5"><CreditCard className="size-4" />Card</span> },
  { value: "other", label: <span className="inline-flex items-center gap-1.5"><Wallet className="size-4" />Other</span> },
];

/** "Pay now" switch + payment method, shared by Start and Add time. */
function PayNow({
  on, onToggle, method, onMethod, amount, currency, sub,
}: {
  on: boolean; onToggle: (v: boolean) => void; method: PaymentMethod; onMethod: (m: PaymentMethod) => void;
  amount: number; currency: string; sub: string;
}) {
  return (
    <div className="space-y-3">
      <ToggleRow
        icon={<Wallet className="size-5" />}
        title={on ? `Collect ${money(amount, currency)} now` : "Pay on exit"}
        sub={on ? sub : "The customer pays at checkout"}
        on={on}
        onChange={onToggle}
      />
      <AnimatePresence initial={false}>
        {on && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <Field label="Paid with">
              <Chips value={method} onChange={onMethod} options={PAYMENTS} />
            </Field>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Animated "start → end" strip used to preview booked time. */
function EndsPreview({ from, to, label, highlight }: { from: string; to: string; label: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white/[0.02] px-4 py-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-faint">{label}</p>
        <div className="mt-0.5 flex items-center gap-2 font-mono text-lg font-bold tabular-nums">
          <span className="text-muted">{from}</span>
          <ArrowRight className="size-4 text-faint" />
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={to}
              initial={{ y: 14, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -14, opacity: 0 }}
              className={highlight ? "text-brand glow-text" : "text-white"}
            >
              {to}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>
      <CalendarClock className="size-6 text-brand/70" />
    </div>
  );
}

/* ================================================================== */
/*  Start session                                                     */
/* ================================================================== */
export function StartSessionSheet(props: { screen: Screen | null; onClose: () => void; onStarted: (s: Session) => void }) {
  // Remount per screen so the form starts fresh each time
  return <StartSessionBody key={props.screen?.id ?? "none"} {...props} />;
}

function StartSessionBody({
  screen, onClose, onStarted,
}: { screen: Screen | null; onClose: () => void; onStarted: (s: Session) => void }) {
  const { games, settings, screens, liveByScreen, start, plans, offers, members } = useArcade();
  const now = useNow();
  const toast = useToast();
  const activeGames = games.filter((g) => g.is_active);
  const [who, setWho] = useState<"walkin" | "member">("walkin");
  const [memberSel, setMemberSel] = useState<Member | null>(null);
  const [more, setMore] = useState(false);

  const [screenId, setScreenId] = useState<string>(screen?.id ?? "");
  const [game, setGame] = useState(activeGames[0]?.title ?? "");
  const [customGame, setCustomGame] = useState("");
  const [minutes, setMinutes] = useState(60);
  const [teamCode, setTeamCode] = useState("0");
  const [players, setPlayers] = useState(2);
  const [customer, setCustomer] = useState("");
  const [phone, setPhone] = useState("");
  const [payNow, setPayNow] = useState(settings?.prepay_default ?? true);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [busy, setBusy] = useState(false);

  const free = screens.filter((s) => s.is_active && !liveByScreen.has(s.id));
  const sel = screens.find((s) => s.id === screenId) ?? screen;
  const rate = Number(sel?.hourly_rate ?? settings?.default_hourly_rate ?? 0);
  const cur = settings?.currency ?? "KES";
  const durations = settings
    ? [...bookingOptions(settings).map((m) => ({ value: m, label: hoursLabel(m) })), ...(settings.allow_open_time ? [{ value: 0, label: "Open" }] : [])]
    : [];
  const member = who === "member" && memberSel ? members.find((m) => m.id === memberSel.id) ?? memberSel : null;
  const memberOk = !!member && ["active", "expiring"].includes(memberState(member, now));
  const benefit = settings && memberOk ? benefitFor(member, plans, offers, now, settings.timezone) : { pct: 0, title: null };
  const fullPrice = settings && minutes ? bookedPrice(minutes, rate, settings) : null;
  const price = fullPrice != null ? memberNet(fullPrice, benefit.pct) : null;
  const collect = payNow && !!minutes;
  const blocked = who === "member" && !memberOk;
  const title = game === "__other" ? customGame.trim() : game;

  async function submit() {
    if (!sel || !title) return;
    setBusy(true);
    try {
      // Ask once for notification permission (needs a user gesture)
      if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
      const s = await start({
        screenId: sel.id,
        game: title,
        teamCode,
        players,
        customerName: customer,
        customerPhone: phone,
        plannedMinutes: minutes || null,
        paymentMethod: collect ? method : null,
        memberId: memberOk ? member!.id : null,
      });
      playStart();
      if (collect) setTimeout(playCoin, 250);
      onStarted(s);
    } catch (e) {
      toast("error", "Couldn't start session", errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={!!screen}
      onClose={onClose}
      title={<>Start session · <span className="text-brand">Screen {sel?.code}</span></>}
      subtitle={`${sel?.console ?? "PS5"} · ${money(rate, cur)} per hour`}
      footer={
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-faint">
              {collect ? "Pay now" : minutes ? "Due on exit" : "Billed on exit"}
            </p>
            <p className="font-display text-lg font-bold text-white">
              {price != null ? money(price, cur) : `${money(memberNet(rate, benefit.pct), cur)}/hr`}
              {benefit.pct > 0 && fullPrice != null && <span className="ml-2 text-sm font-normal text-faint line-through">{money(fullPrice, cur)}</span>}
            </p>
          </div>
          <Button size="lg" loading={busy} disabled={!title || blocked} onClick={submit} icon={<Play className="size-5 fill-current" />}>
            {collect ? "Take payment & start" : "Start & print"}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {([
              { v: "walkin", label: "Walk-in", sub: "Not a member", icon: Footprints },
              { v: "member", label: "Member", sub: "Member price", icon: Crown },
            ] as const).map(({ v, label, sub, icon: Icon }) => {
              const on = who === v;
              return (
                <button key={v} type="button" onClick={() => setWho(v)}
                  className={cn("relative flex items-center gap-3 overflow-hidden rounded-2xl border px-4 py-3 text-left transition", on ? "border-brand bg-brand/10" : "border-line hover:border-white/20")}>
                  <Icon className={cn("size-5", on ? "text-brand" : "text-faint")} />
                  <span>
                    <span className={cn("block font-semibold", on ? "text-white" : "text-muted")}>{label}</span>
                    <span className="block text-xs text-faint">{sub}</span>
                  </span>
                  {on && <motion.span layoutId="who-on" className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-brand" />}
                </button>
              );
            })}
          </div>
          {who === "member" && <MemberPicker value={memberSel} onChange={setMemberSel} />}
          {memberOk && benefit.pct > 0 && (
            <p className="flex items-center gap-2 text-sm text-brand"><Crown className="size-4" />{benefit.pct}% off: {benefit.title}</p>
          )}
        </div>

        {free.length > 1 && (
          <Field label="Screen">
            <Chips
              value={screenId}
              onChange={setScreenId}
              options={[...free, ...(screen && !free.some((f) => f.id === screen.id) ? [screen] : [])].map((s) => ({ value: s.id, label: s.code }))}
            />
          </Field>
        )}

        <Field label="Game">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[...activeGames.map((g) => g.title), "__other"].map((t) => {
              const on = game === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setGame(t)}
                  className={cn(
                    "relative flex h-12 items-center gap-2 overflow-hidden rounded-xl border px-3 text-left text-sm font-medium transition",
                    on ? "border-brand bg-brand/10 text-white" : "border-line text-muted hover:border-white/20 hover:text-white",
                  )}
                >
                  <Gamepad2 className={cn("size-4 shrink-0", on ? "text-brand" : "text-faint")} />
                  <span className="truncate">{t === "__other" ? "Other…" : t}</span>
                  {on && <motion.span layoutId="game-on" className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand" />}
                </button>
              );
            })}
          </div>
          {game === "__other" && (
            <Input className="mt-2" autoFocus placeholder="Type the game title" value={customGame} onChange={(e) => setCustomGame(e.target.value)} />
          )}
        </Field>

        <Field label="Hours booked" hint={settings?.allow_open_time ? "Open = pay on exit" : `${money(rate, cur)} per hour`}>
          <Chips value={minutes} onChange={setMinutes} options={durations} />
        </Field>
        {now > 0 && (
          minutes ? (
            <EndsPreview label="Start → ends at" from={hm(new Date(now))} to={hm(new Date(now + minutes * 60_000))} highlight />
          ) : (
            <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-muted">Open time: no end time. The customer can stay as long as they like and pays per hour on exit.</p>
          )
        )}

        {!!minutes && price != null && (
          <PayNow
            on={payNow}
            onToggle={setPayNow}
            method={method}
            onMethod={setMethod}
            amount={price}
            currency={cur}
            sub={`${hoursLabel(minutes)} paid upfront, shown on the ticket`}
          />
        )}

        <button type="button" onClick={() => setMore((v) => !v)} className="flex items-center gap-1.5 text-sm font-medium text-muted hover:text-white">
          <ChevronDown className={cn("size-4 transition-transform", more && "rotate-180")} />
          More details <span className="text-faint">(players, {who === "walkin" ? "name, phone, " : ""}team code)</span>
        </button>
        <AnimatePresence initial={false}>
        {more && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
        <div className="grid grid-cols-2 gap-3 pb-1">
          <Field label="Team code">
            <Input value={teamCode} onChange={(e) => setTeamCode(e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="Players">
            <div className="flex h-11 items-center justify-between rounded-xl border border-line bg-white/[0.03] px-1">
              <button type="button" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-white/5 hover:text-white" onClick={() => setPlayers((p) => Math.max(1, p - 1))} aria-label="Fewer players">
                <Minus className="size-4" />
              </button>
              <span className="font-display text-lg font-bold tabular-nums">{players}</span>
              <button type="button" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-white/5 hover:text-white" onClick={() => setPlayers((p) => Math.min(16, p + 1))} aria-label="More players">
                <Plus className="size-4" />
              </button>
            </div>
          </Field>
          {who === "walkin" && (
            <>
              <Field label="Customer" hint="optional">
                <Input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Name" />
              </Field>
              <Field label="Phone" hint="optional">
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07…" inputMode="tel" />
              </Field>
            </>
          )}
        </div>
        </motion.div>
        )}
        </AnimatePresence>
      </div>
    </Sheet>
  );
}

/* ================================================================== */
/*  Add time (+1 hour) to a live session                              */
/* ================================================================== */
export function ExtendSheet(props: { session: Session | null; onClose: () => void; onExtended: (s: Session, print: boolean) => void }) {
  return <ExtendBody key={props.session?.id ?? "none"} {...props} />;
}

function ExtendBody({
  session, onClose, onExtended,
}: { session: Session | null; onClose: () => void; onExtended: (s: Session, print: boolean) => void }) {
  const { settings, extend } = useArcade();
  const now = useNow();
  const toast = useToast();
  const [add, setAdd] = useState(() => (settings ? extendOptions(settings)[0] : 60));
  const [payNow, setPayNow] = useState(() => !!settings?.prepay_default || Number(session?.prepaid_amount ?? 0) > 0);
  const [method, setMethod] = useState<PaymentMethod>(session?.payment_method ?? "cash");
  const [printTicket, setPrintTicket] = useState(true);
  const [busy, setBusy] = useState(false);

  if (!settings) return null;
  const s = session;
  const cur = settings.currency;
  const options = extendOptions(settings).map((m) => ({ value: m, label: `+ ${hoursLabel(m)}` }));
  const due = s ? topUpFor(s, add, now, settings) : 0;
  const oldEnd = s ? endsAt(s, now) : null;
  const newEnd = s ? endsAt({ ...s, planned_minutes: plannedAfter(s, add, now) }, now) : null;
  const collect = payNow && due > 0;

  async function submit() {
    if (!s) return;
    setBusy(true);
    try {
      const row = await extend(s.id, add, collect ? method : null);
      if (collect) playCoin();
      toast("success", `Added ${hoursLabel(add)} to screen ${s.screen_code}`, newEnd ? `Now ends at ${hm(new Date(newEnd))}` : undefined);
      onExtended(row, printTicket);
    } catch (e) {
      toast("error", "Couldn't add time", errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={!!s}
      onClose={onClose}
      title={<>Add time · <span className="text-brand">Screen {s?.screen_code}</span></>}
      subtitle={s ? `${s.receipt_code} · ${s.game_title} · same receipt, no restart` : ""}
      footer={
        <Button size="lg" className="w-full" loading={busy} onClick={submit} icon={<TimerReset className="size-5" />}>
          Add {hoursLabel(add)}{collect ? ` · collect ${money(due, cur)}` : ""}
        </Button>
      }
    >
      {s && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-2">
            {options.map((o) => {
              const on = add === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setAdd(o.value)}
                  className={cn(
                    "relative h-16 overflow-hidden rounded-2xl border font-display text-xl font-bold transition",
                    on ? "border-brand bg-brand/10 text-brand" : "border-line text-muted hover:border-white/20 hover:text-white",
                  )}
                >
                  {on && <motion.span layoutId="extend-on" className="absolute inset-0 rounded-2xl ring-2 ring-brand/60" transition={{ type: "spring", stiffness: 500, damping: 35 }} />}
                  <span className="relative">{o.label}</span>
                </button>
              );
            })}
          </div>

          <EndsPreview
            label={s.planned_minutes ? "Ends at" : "Open time → ends at"}
            from={oldEnd ? hm(new Date(oldEnd)) : "open"}
            to={newEnd ? hm(new Date(newEnd)) : "—"}
            highlight
          />
          <p className="-mt-2 text-xs text-faint">
            Booked {s.planned_minutes ? hoursLabel(s.planned_minutes) : "open time"} → {hoursLabel(plannedAfter(s, add, now))}
            {s.status === "paused" && " · the timer is paused, so the end time moves on when it resumes"}
          </p>

          {due > 0 ? (
            <PayNow
              on={payNow}
              onToggle={setPayNow}
              method={method}
              onMethod={setMethod}
              amount={due}
              currency={cur}
              sub={Number(s.prepaid_amount) > 0 ? `${money(s.prepaid_amount, cur)} already paid` : "Covers all time booked so far"}
            />
          ) : (
            <p className="rounded-2xl border border-ok/30 bg-ok/5 px-4 py-3 text-sm text-ok">Already covered by what the customer has paid.</p>
          )}

          <ToggleRow
            icon={<Printer className="size-5" />}
            title="Print updated ticket"
            sub="Shows the customer the new end time"
            on={printTicket}
            onChange={setPrintTicket}
          />
        </div>
      )}
    </Sheet>
  );
}

/* ================================================================== */
/*  Checkout (end & bill)                                             */
/* ================================================================== */
export function CheckoutSheet(props: { session: Session | null; onClose: () => void; onPaid: (s: Session) => void }) {
  return <CheckoutBody key={props.session?.id ?? "none"} {...props} />;
}

function maxStaffDiscount(st: Settings, isAdmin: boolean, gross: number) {
  if (isAdmin || st.staff_max_discount_pct >= 100) return gross;
  return Math.floor(gross * st.staff_max_discount_pct) / 100;
}

function CheckoutBody({
  session, onClose, onPaid,
}: { session: Session | null; onClose: () => void; onPaid: (s: Session) => void }) {
  const { settings, end, isAdmin } = useArcade();
  const now = useNow();
  const toast = useToast();
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [discount, setDiscount] = useState("");
  const [busy, setBusy] = useState(false);

  if (!settings) return null;
  const cur = settings.currency;
  const bill = session ? liveBill(session, now, settings) : null;
  const cap = bill ? maxStaffDiscount(settings, isAdmin, bill.amount) : 0;
  const wanted = Math.max(Number(discount) || 0, 0);
  const disc = Math.min(wanted, bill?.amount ?? 0);
  const overCap = wanted > cap + 0.001;
  const total = (bill?.amount ?? 0) - disc;
  const due = Math.round((total - (bill?.prepaid ?? 0)) * 100) / 100;
  const end_ = session ? endsAt(session, now) : null;
  const leftEarly = !!(session?.planned_minutes && bill && bill.played < session.planned_minutes - settings.grace_minutes);

  async function submit() {
    if (!session) return;
    setBusy(true);
    try {
      const s = await end(session.id, payment, disc);
      playCoin();
      onPaid(s);
    } catch (e) {
      toast("error", "Couldn't close session", errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={!!session}
      onClose={onClose}
      title={<>Checkout · <span className="text-brand">Screen {session?.screen_code}</span></>}
      subtitle={session ? `${session.receipt_code} · ${session.member_name ? `★ ${session.member_name} · ` : ""}${session.game_title} · in at ${hm(session.started_at)}${end_ ? ` · booked until ${hm(new Date(end_))}` : ""}` : ""}
      footer={
        <Button size="lg" className="w-full" loading={busy} disabled={overCap} onClick={submit} icon={<Printer className="size-5" />}>
          {due > 0 ? `Charge ${money(due, cur)} & print` : due < 0 ? `Refund ${money(-due, cur)} & print` : "Paid in full · close & print"}
        </Button>
      }
    >
      {session && bill && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { k: "Played", v: clock(elapsedSeconds(session, now)) },
              { k: "Charged", v: duration(bill.billed) },
              { k: "Rate", v: `${money(session.hourly_rate, "")}/h`.trim() },
            ].map((x) => (
              <div key={x.k} className="rounded-2xl border border-line bg-white/[0.02] px-2 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-faint">{x.k}</p>
                <p className="mt-1 font-mono text-base font-bold tabular-nums text-white">{x.v}</p>
              </div>
            ))}
          </div>
          <p className="-mt-2 text-xs text-faint">
            {settings.billing_increment_minutes >= 60 ? "Charged per hour" : `Charged in ${settings.billing_increment_minutes}-min blocks`} · {settings.grace_minutes} min grace · minimum {duration(settings.minimum_minutes)}.
            {leftEarly && settings.charge_booked_time && " Booked time is charged in full."}
            {session.paused_seconds > 0 && ` Paused time (${duration(Math.round(session.paused_seconds / 60))}) is not charged.`}
          </p>

          {due !== 0 && (
            <Field label={due < 0 ? "Refund with" : "Payment method"}>
              <Chips value={payment} onChange={setPayment} options={PAYMENTS} />
            </Field>
          )}

          <Field
            label="Discount"
            hint={!isAdmin && settings.staff_max_discount_pct < 100 ? (settings.staff_max_discount_pct ? `staff max ${settings.staff_max_discount_pct}% (${money(cap, cur)})` : "admins only") : cur}
          >
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              placeholder="0"
              value={discount}
              disabled={!isAdmin && settings.staff_max_discount_pct === 0}
              onChange={(e) => setDiscount(e.target.value)}
              className={overCap ? "border-bad/60" : ""}
            />
            {overCap && <p className="mt-1.5 flex items-center gap-1.5 text-xs text-bad"><ShieldAlert className="size-3.5" />Bigger discounts need an admin.</p>}
          </Field>

          <div className="rounded-2xl border border-brand/25 bg-brand/[0.05] p-4">
            <div className="flex justify-between text-sm text-muted"><span>Charge ({duration(bill.billed)})</span><span className="tabular-nums">{money(bill.gross, cur)}</span></div>
            {bill.memberDiscount > 0 && (
              <div className="mt-1 flex justify-between text-sm text-brand">
                <span className="flex items-center gap-1.5"><Crown className="size-3.5" />Member {session.member_discount_pct}%{session.offer_title ? ` · ${session.offer_title}` : ""}</span>
                <span className="tabular-nums">− {money(bill.memberDiscount, cur)}</span>
              </div>
            )}
            {disc > 0 && <div className="mt-1 flex justify-between text-sm text-muted"><span>Discount</span><span className="tabular-nums">− {money(disc, cur)}</span></div>}
            {bill.prepaid > 0 && <div className="mt-1 flex justify-between text-sm text-ok"><span>Already paid</span><span className="tabular-nums">− {money(bill.prepaid, cur)}</span></div>}
            <div className="mt-2 flex items-baseline justify-between border-t border-brand/20 pt-2">
              <span className="font-display font-semibold text-white">{due < 0 ? "Refund" : "Balance due"}</span>
              <span className={cn("font-display text-3xl font-bold tabular-nums", due < 0 ? "text-sky-300" : "text-brand glow-text")}>{money(Math.abs(due), cur)}</span>
            </div>
          </div>
          <p className="text-xs text-faint">The final amount is calculated on the server at the moment you confirm.</p>
        </div>
      )}
    </Sheet>
  );
}

/* ================================================================== */
/*  Manage live session (add time / pause / move / reprint / void)    */
/* ================================================================== */
export function ManageSheet(props: {
  session: Session | null; onClose: () => void; onReprint: (s: Session) => void; onExtend: (s: Session) => void;
}) {
  return <ManageBody key={props.session?.id ?? "none"} {...props} />;
}

function MenuItem({ icon, label, sub, onClick, danger, disabled, primary }: { icon: React.ReactNode; label: string; sub?: string; onClick: () => void; danger?: boolean; disabled?: boolean; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border border-line px-4 py-3.5 text-left transition hover:border-white/15 hover:bg-white/[0.03] disabled:opacity-50",
        danger && "hover:border-bad/40 hover:bg-bad/5",
        primary && "border-brand/40 bg-brand/[0.06] hover:border-brand/70 hover:bg-brand/10",
      )}
    >
      <span className={cn("grid size-10 place-items-center rounded-xl", primary ? "bg-brand text-black" : "bg-white/[0.05]", danger ? "text-bad" : !primary && "text-brand")}>{icon}</span>
      <span>
        <span className={cn("block font-semibold", danger ? "text-bad" : "text-white")}>{label}</span>
        {sub && <span className="block text-sm text-muted">{sub}</span>}
      </span>
    </button>
  );
}

function ManageBody({
  session, onClose, onReprint, onExtend,
}: { session: Session | null; onClose: () => void; onReprint: (s: Session) => void; onExtend: (s: Session) => void }) {
  const { screens, settings, isAdmin, liveByScreen, pause, resume, switchScreen, cancel, attachMember } = useArcade();
  const now = useNow();
  const toast = useToast();
  const [mode, setMode] = useState<"menu" | "switch" | "void" | "member">("menu");
  const [pick, setPick] = useState<Member | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const free = useMemo(() => screens.filter((s) => s.is_active && !liveByScreen.has(s.id)), [screens, liveByScreen]);

  async function run(fn: () => Promise<unknown>, ok: string, close = true) {
    setBusy(true);
    try {
      await fn();
      toast("success", ok);
      if (close) onClose();
    } catch (e) {
      toast("error", "Action failed", errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const s = session;
  const end_ = s ? endsAt(s, now) : null;
  const win = settings?.staff_void_window_minutes ?? 0;
  const ageMin = s && now ? (now - Date.parse(s.started_at)) / 60_000 : 0;
  const staffCanVoid = isAdmin || (win > 0 && ageMin <= win);
  const voidSub = isAdmin
    ? "Cancels without charge. The reason is recorded."
    : win === 0 ? "Only an admin can void receipts" : staffCanVoid ? `Allowed within ${win} min of the start. The reason is recorded.` : `Over ${win} min old. Ask an admin to void it.`;

  return (
    <Sheet
      open={!!s}
      onClose={onClose}
      title={<>Screen <span className="text-brand">{s?.screen_code}</span> · {s?.receipt_code}</>}
      subtitle={s ? `${s.game_title} · in ${hm(s.started_at)}${end_ ? ` · ends ${hm(new Date(end_))}` : " · open time"}` : ""}
    >
      {s && mode === "menu" && (
        <div className="space-y-2.5">
          <MenuItem primary disabled={busy} icon={<TimerReset className="size-5" />} label="Add time" sub="+1 hour or more on the same receipt. Take payment now or at checkout." onClick={() => onExtend(s)} />
          {s.status === "paused" ? (
            <MenuItem disabled={busy} icon={<Play className="size-5" />} label="Resume timer" sub="Continue billing from where it stopped" onClick={() => run(() => resume(s.id), "Timer resumed")} />
          ) : (
            <MenuItem disabled={busy} icon={<Pause className="size-5" />} label="Pause timer" sub="Power cut, controller swap. Paused time isn't billed." onClick={() => run(() => pause(s.id), "Timer paused")} />
          )}
          {!s.member_id && (
            <MenuItem disabled={busy} icon={<Crown className="size-5" />} label="Link a member" sub="Forgot to pick the member, or they just joined? Member price applies at checkout." onClick={() => setMode("member")} />
          )}
          <MenuItem disabled={busy} icon={<ArrowRightLeft className="size-5" />} label="Move to another screen" sub="Keeps the same receipt and timer" onClick={() => setMode("switch")} />
          <MenuItem disabled={busy} icon={<Printer className="size-5" />} label="Reprint ticket" sub="Customer & shop copy with the current end time" onClick={() => onReprint(s)} />
          <MenuItem disabled={busy || !staffCanVoid} icon={<Ban className="size-5" />} label="Void receipt" sub={voidSub} onClick={() => setMode("void")} danger />
        </div>
      )}

      {s && mode === "member" && (
        <div className="space-y-4">
          <MemberPicker value={pick} onChange={setPick} />
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => { setPick(null); setMode("menu"); }}>Back</Button>
            <Button className="flex-1" loading={busy}
              disabled={!pick || !["active", "expiring"].includes(memberState(pick, now))}
              onClick={() => pick && run(() => attachMember(s.id, pick.id), `${pick.full_name} linked to screen ${s.screen_code}`)}
              icon={<Crown className="size-4" />}>
              Link member
            </Button>
          </div>
        </div>
      )}

      {s && mode === "switch" && (
        <div className="space-y-4">
          <p className="text-sm text-muted">Pick a free screen. The timer keeps running.</p>
          {free.length ? (
            <div className="grid grid-cols-4 gap-2">
              {free.map((f) => (
                <button
                  key={f.id}
                  disabled={busy}
                  onClick={() => run(() => switchScreen(s.id, f.id), `Moved to screen ${f.code}`)}
                  className="grid h-16 place-items-center rounded-2xl border border-line font-display text-2xl font-bold text-brand transition hover:border-brand/50 hover:bg-brand/5"
                >
                  {f.code}
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-line p-4 text-sm text-muted">All screens are busy.</p>
          )}
          <Button variant="ghost" onClick={() => setMode("menu")}>Back</Button>
        </div>
      )}

      {s && mode === "void" && (
        <div className="space-y-4">
          <Field label="Reason for voiding">
            <Input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Wrong screen selected" />
          </Field>
          {Number(s.prepaid_amount) > 0 && (
            <p className="rounded-2xl border border-warn/30 bg-warn/5 px-4 py-3 text-sm text-warn">
              The customer paid {money(s.prepaid_amount, settings?.currency)} upfront. It will be recorded as refunded.
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setMode("menu")}>Back</Button>
            <Button variant="danger" className="flex-1" loading={busy} disabled={!reason.trim()} onClick={() => run(() => cancel(s.id, reason.trim()), `${s.receipt_code} voided`)}>
              Void receipt
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
