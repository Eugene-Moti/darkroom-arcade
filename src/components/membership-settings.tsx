"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Gift, Percent, Plus, Sparkles, Trash2 } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { describeOffer, DAY_SHORT, planLength } from "@/lib/membership";
import { cn, errorMessage, money } from "@/lib/format";
import type { MemberOffer, MembershipPlan } from "@/lib/types";
import { useArcade } from "./arcade-provider";
import { useToast } from "./toast";
import { Button, Chips, Field, Input, Sheet, Toggle } from "./ui";

const LENGTHS = [
  { value: 1, label: "1 day" },
  { value: 7, label: "1 week" },
  { value: 30, label: "1 month" },
  { value: 90, label: "3 months" },
  { value: 365, label: "1 year" },
];

/* ------------------------------------------------------------------ */
/*  Plans: how long a membership lasts, what it costs, the discount    */
/* ------------------------------------------------------------------ */
export function PlansEditor() {
  const { plans, setPlans, settings } = useArcade();
  const toast = useToast();
  const sb = getSupabase();
  const cur = settings?.currency ?? "KES";

  async function patch(id: string, p: Partial<MembershipPlan>) {
    const { data, error } = await sb.from("membership_plans").update(p).eq("id", id).select().single();
    if (error) return toast("error", "Couldn't update plan", errorMessage(error));
    setPlans(plans.map((x) => (x.id === id ? (data as MembershipPlan) : x)));
  }
  async function add() {
    const { data, error } = await sb.from("membership_plans")
      .insert({ name: "New plan", duration_days: 30, price: 0, discount_pct: 10, sort_order: plans.length + 1 }).select().single();
    if (error) return toast("error", "Couldn't add plan", errorMessage(error));
    setPlans([...plans, data as MembershipPlan]);
  }
  async function remove(p: MembershipPlan) {
    if (!confirm(`Delete the ${p.name} plan? Plans that members are on can only be switched off.`)) return;
    const { error } = await sb.from("membership_plans").delete().eq("id", p.id);
    if (error) return toast("error", "Members are on this plan", "Switch it off instead. Existing members keep it until they expire.");
    setPlans(plans.filter((x) => x.id !== p.id));
  }

  return (
    <div className="space-y-3">
      {plans.map((p) => (
        <motion.div layout key={p.id} className={cn("rounded-2xl border p-4", p.is_active ? "border-line" : "border-line opacity-60")}>
          <div className="grid gap-3 sm:grid-cols-[1fr_120px_110px_auto_auto] sm:items-end">
            <Field label="Plan name"><Input defaultValue={p.name} onBlur={(e) => e.target.value.trim() && e.target.value !== p.name && patch(p.id, { name: e.target.value.trim() })} /></Field>
            <Field label={`Price (${cur})`}><Input type="number" inputMode="decimal" defaultValue={p.price} onBlur={(e) => Number(e.target.value) !== Number(p.price) && patch(p.id, { price: Math.max(0, Number(e.target.value) || 0) })} /></Field>
            <Field label="Discount %"><Input type="number" inputMode="numeric" defaultValue={p.discount_pct} onBlur={(e) => Number(e.target.value) !== p.discount_pct && patch(p.id, { discount_pct: Math.min(100, Math.max(0, Math.round(Number(e.target.value) || 0))) })} /></Field>
            <div className="pb-2"><Toggle on={p.is_active} onChange={(v) => patch(p.id, { is_active: v })} label={p.is_active ? "On" : "Off"} /></div>
            <button onClick={() => remove(p)} className="mb-1 justify-self-start rounded-xl p-2.5 text-faint hover:bg-bad/10 hover:text-bad" aria-label={`Delete ${p.name}`}><Trash2 className="size-4" /></button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted">Lasts</span>
            <Chips value={LENGTHS.some((l) => l.value === p.duration_days) ? p.duration_days : -1} onChange={(v) => v > 0 && patch(p.id, { duration_days: v })}
              options={[...LENGTHS, ...(LENGTHS.some((l) => l.value === p.duration_days) ? [] : [{ value: -1, label: planLength(p.duration_days) }])]} />
            <span className="flex items-center gap-2">
              <span className="block w-20">
                <Input type="number" inputMode="numeric" defaultValue={p.duration_days} key={p.duration_days} className="h-9" aria-label="Days"
                  onBlur={(e) => Number(e.target.value) > 0 && Number(e.target.value) !== p.duration_days && patch(p.id, { duration_days: Math.min(3660, Math.round(Number(e.target.value))) })} />
              </span>
              <span className="text-xs text-faint">days</span>
            </span>
          </div>
          <p className="mt-2 text-xs text-faint">
            {money(p.price, cur)} for {planLength(p.duration_days)}{p.discount_pct ? `, then ${p.discount_pct}% off every hour played` : ""}.
          </p>
        </motion.div>
      ))}
      <Button variant="outline" icon={<Plus className="size-4" />} onClick={add}>Add plan</Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Offers: extra discounts at set days/times, or perks               */
/* ------------------------------------------------------------------ */
const BLANK: Omit<MemberOffer, "id"> = {
  title: "", description: null, kind: "percent", discount_pct: 25, plan_id: null, days: null,
  start_time: null, end_time: null, valid_from: null, valid_to: null, is_active: true, sort_order: 0,
};

export function OffersEditor() {
  const { offers, plans, setOffers } = useArcade();
  const toast = useToast();
  const [editing, setEditing] = useState<MemberOffer | Omit<MemberOffer, "id"> | null>(null);

  async function toggle(o: MemberOffer) {
    const { data, error } = await getSupabase().from("member_offers").update({ is_active: !o.is_active }).eq("id", o.id).select().single();
    if (error) return toast("error", "Couldn't update offer", errorMessage(error));
    setOffers(offers.map((x) => (x.id === o.id ? (data as MemberOffer) : x)));
  }

  return (
    <div className="space-y-3">
      {offers.length === 0 && <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">No offers yet. Try a weekday happy hour, or a perk like “Free soda on Fridays”.</p>}
      <AnimatePresence initial={false}>
        {offers.map((o) => (
          <motion.div key={o.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={cn("flex items-center gap-3 rounded-2xl border border-line p-3", !o.is_active && "opacity-60")}>
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">{o.kind === "percent" ? <Percent className="size-5" /> : <Gift className="size-5" />}</span>
            <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(o)}>
              <p className="truncate font-semibold text-white">{o.title}</p>
              <p className="truncate text-xs text-muted">{describeOffer(o, plans)}</p>
            </button>
            <Toggle on={o.is_active} onChange={() => toggle(o)} />
          </motion.div>
        ))}
      </AnimatePresence>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" icon={<Percent className="size-4" />} onClick={() => setEditing({ ...BLANK, title: "Happy hour", days: [1, 2, 3, 4, 5], start_time: "10:00", end_time: "14:00" })}>Add discount offer</Button>
        <Button variant="outline" icon={<Gift className="size-4" />} onClick={() => setEditing({ ...BLANK, kind: "perk", discount_pct: null, title: "" })}>Add perk</Button>
      </div>
      <OfferSheet key={editing ? ("id" in editing ? editing.id : "new" + editing.kind) : "none"} offer={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function OfferSheet({ offer, onClose }: { offer: MemberOffer | Omit<MemberOffer, "id"> | null; onClose: () => void }) {
  const { plans, offers, setOffers } = useArcade();
  const toast = useToast();
  const [f, setF] = useState(offer ?? BLANK);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const isNew = !offer || !("id" in offer);
  const allDay = !f.start_time || !f.end_time;
  const days = f.days ?? [];

  async function save() {
    setBusy(true);
    const payload = {
      title: f.title.trim(), description: f.description?.trim() || null, kind: f.kind,
      discount_pct: f.kind === "percent" ? Math.min(100, Math.max(1, Math.round(Number(f.discount_pct) || 0))) : null,
      plan_id: f.plan_id, days: days.length && days.length < 7 ? days : null,
      start_time: allDay ? null : f.start_time, end_time: allDay ? null : f.end_time,
      valid_from: f.valid_from || null, valid_to: f.valid_to || null, is_active: f.is_active,
    };
    const sb = getSupabase().from("member_offers");
    const { data, error } = isNew ? await sb.insert(payload).select().single() : await sb.update(payload).eq("id", (offer as MemberOffer).id).select().single();
    setBusy(false);
    if (error) return toast("error", "Couldn't save offer", errorMessage(error));
    const row = data as MemberOffer;
    setOffers(isNew ? [...offers, row] : offers.map((x) => (x.id === row.id ? row : x)));
    toast("success", isNew ? "Offer added" : "Offer saved");
    onClose();
  }
  async function remove() {
    if (isNew || !confirm(`Delete “${f.title}”?`)) return;
    const { error } = await getSupabase().from("member_offers").delete().eq("id", (offer as MemberOffer).id);
    if (error) return toast("error", "Couldn't delete", errorMessage(error));
    setOffers(offers.filter((x) => x.id !== (offer as MemberOffer).id));
    onClose();
  }

  return (
    <Sheet
      open={!!offer}
      onClose={onClose}
      title={<>{isNew ? "New" : "Edit"} <span className="text-brand">{f.kind === "percent" ? "discount offer" : "perk"}</span></>}
      subtitle={f.kind === "percent" ? "Applied automatically when a member's session starts inside the offer's days and times" : "Printed on receipts and shown to staff. Doesn't change prices."}
      footer={
        <div className="flex gap-2">
          {!isNew && <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={remove}>Delete</Button>}
          <Button className="flex-1" loading={busy} disabled={!f.title.trim() || (f.kind === "percent" && !Number(f.discount_pct))} onClick={save}>Save offer</Button>
        </div>
      }
    >
      <div className="space-y-5">
        <Field label="Type">
          <Chips value={f.kind} onChange={(v) => set("kind", v)} options={[{ value: "percent", label: "Discount %" }, { value: "perk", label: "Perk (text only)" }]} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
          <Field label="Title"><Input autoFocus value={f.title} onChange={(e) => set("title", e.target.value)} placeholder={f.kind === "percent" ? "e.g. Happy hour" : "e.g. Free soda on Fridays"} /></Field>
          {f.kind === "percent" && <Field label="Discount %"><Input type="number" inputMode="numeric" value={f.discount_pct ?? ""} onChange={(e) => set("discount_pct", Number(e.target.value))} /></Field>}
        </div>
        <Field label="Details" hint="optional"><Input value={f.description ?? ""} onChange={(e) => set("description", e.target.value)} placeholder="Shown under the title" /></Field>
        <Field label="Who gets it">
          <Chips value={f.plan_id ?? ""} onChange={(v) => set("plan_id", v || null)} options={[{ value: "", label: "All members" }, ...plans.map((p) => ({ value: p.id, label: `${p.name} only` }))]} />
        </Field>
        {f.kind === "percent" && (
          <>
            <Field label="Days" hint={days.length && days.length < 7 ? "" : "every day"}>
              <div className="flex flex-wrap gap-1.5">
                {DAY_SHORT.map((d, i) => {
                  const on = days.includes(i);
                  return (
                    <button key={d} type="button" onClick={() => set("days", on ? days.filter((x) => x !== i) : [...days, i].sort())}
                      className={cn("h-10 w-12 rounded-xl border text-sm font-semibold transition", on ? "border-brand bg-brand text-black" : "border-line text-muted hover:text-white")}>
                      {d}
                    </button>
                  );
                })}
              </div>
            </Field>
            <div className="flex flex-wrap items-end gap-3">
              <div className="pb-2"><Toggle on={allDay} onChange={(v) => { set("start_time", v ? null : "10:00"); set("end_time", v ? null : "14:00"); }} label="" /></div>
              <span className="pb-3 text-sm text-muted">All day</span>
              {!allDay && (
                <>
                  <Field label="From"><Input type="time" value={f.start_time?.slice(0, 5) ?? ""} onChange={(e) => set("start_time", e.target.value)} /></Field>
                  <Field label="To"><Input type="time" value={f.end_time?.slice(0, 5) ?? ""} onChange={(e) => set("end_time", e.target.value)} /></Field>
                </>
              )}
            </div>
          </>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Starts" hint="optional"><Input type="date" value={f.valid_from ?? ""} onChange={(e) => set("valid_from", e.target.value || null)} /></Field>
          <Field label="Ends" hint="optional"><Input type="date" value={f.valid_to ?? ""} onChange={(e) => set("valid_to", e.target.value || null)} /></Field>
        </div>
        {f.title.trim() && (
          <p className="flex items-start gap-2 rounded-2xl border border-brand/25 bg-brand/[0.05] px-4 py-3 text-sm">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-brand" />
            <span><b className="text-white">{f.title}</b> <span className="text-muted">· {describeOffer({ ...(f as MemberOffer), id: "x", days: days.length ? days : null, start_time: allDay ? null : f.start_time, end_time: allDay ? null : f.end_time }, plans)}</span></span>
          </p>
        )}
        <p className="text-xs text-faint">A member always gets the single best discount: their plan&apos;s or a matching offer&apos;s (they don&apos;t add up).</p>
      </div>
    </Sheet>
  );
}
