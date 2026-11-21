"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Banknote, Check, Crown, CreditCard, RefreshCw, Search, Smartphone, UserPlus, Wallet, X } from "lucide-react";
import type { Member, MembershipPlan, PaymentMethod } from "@/lib/types";
import { daysLeft, memberState, planLength, type MemberState } from "@/lib/membership";
import { cn, errorMessage, money, prettyDate } from "@/lib/format";
import { playCoin } from "@/lib/sound";
import { useArcade, useNow, type MemberResult } from "./arcade-provider";
import { usePrintMembership } from "./member-print";
import { useToast } from "./toast";
import { Button, Chips, Field, Input } from "./ui";

export const PAY_OPTIONS: { value: PaymentMethod; label: React.ReactNode }[] = [
  { value: "cash", label: <span className="inline-flex items-center gap-1.5"><Banknote className="size-4" />Cash</span> },
  { value: "mpesa", label: <span className="inline-flex items-center gap-1.5"><Smartphone className="size-4" />M-Pesa</span> },
  { value: "card", label: <span className="inline-flex items-center gap-1.5"><CreditCard className="size-4" />Card</span> },
  { value: "other", label: <span className="inline-flex items-center gap-1.5"><Wallet className="size-4" />Other</span> },
];

const STATE_UI: Record<MemberState, { label: string; cls: string }> = {
  active: { label: "Active", cls: "border-ok/30 bg-ok/10 text-ok" },
  expiring: { label: "Expiring", cls: "border-warn/30 bg-warn/10 text-warn" },
  expired: { label: "Expired", cls: "border-bad/30 bg-bad/10 text-bad" },
  "no-plan": { label: "No plan", cls: "border-line bg-white/[0.04] text-muted" },
  inactive: { label: "Deactivated", cls: "border-line bg-white/[0.04] text-faint" },
};

export function MemberStatus({ member, now }: { member: Member; now: number }) {
  const st = memberState(member, now);
  const left = daysLeft(member, now);
  const ui = STATE_UI[st];
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold", ui.cls)}>
      {ui.label}
      {(st === "active" || st === "expiring") && <span className="font-normal opacity-80">· {left}d left</span>}
    </span>
  );
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
}

export function MemberAvatar({ member, size = "md" }: { member: Pick<Member, "full_name">; size?: "sm" | "md" | "lg" }) {
  return (
    <span className={cn(
      "grid shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand to-brand-deep font-display font-bold text-black",
      size === "sm" ? "size-9 text-sm" : size === "lg" ? "size-16 text-2xl" : "size-11 text-base",
    )}>
      {initials(member.full_name)}
    </span>
  );
}

function PlanChoice({ plans, value, onChange, allowNone }: { plans: MembershipPlan[]; value: string; onChange: (v: string) => void; allowNone?: boolean }) {
  const { settings } = useArcade();
  const list = plans.filter((p) => p.is_active);
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {list.map((p) => {
        const on = value === p.id;
        return (
          <button key={p.id} type="button" onClick={() => onChange(p.id)}
            className={cn("relative rounded-2xl border p-3 text-left transition", on ? "border-brand bg-brand/10" : "border-line hover:border-white/20")}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-display font-bold text-white">{p.name}</span>
              <span className="font-semibold tabular-nums text-brand">{money(p.price, settings?.currency)}</span>
            </div>
            <p className="text-xs text-muted">{planLength(p.duration_days)}{p.discount_pct ? ` · ${p.discount_pct}% off every hour` : ""}</p>
            {on && <Check className="absolute right-2 top-2 hidden size-4 text-brand" />}
          </button>
        );
      })}
      {allowNone && (
        <button type="button" onClick={() => onChange("")}
          className={cn("rounded-2xl border p-3 text-left transition", value === "" ? "border-brand bg-brand/10" : "border-line hover:border-white/20")}>
          <span className="font-display font-bold text-white">No plan yet</span>
          <p className="text-xs text-muted">Save details only, pay later</p>
        </button>
      )}
      {!list.length && <p className="text-sm text-muted sm:col-span-2">No plans yet. An admin can add them in Settings → Membership.</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sign up                                                           */
/* ------------------------------------------------------------------ */
export function NewMemberForm({ initial = "", onDone, onCancel }: { initial?: string; onDone: (r: MemberResult) => void; onCancel?: () => void }) {
  const { plans, createMember, settings } = useArcade();
  const printCard = usePrintMembership();
  const toast = useToast();
  const looksLikePhone = /^[\d\s+()-]{6,}$/.test(initial.trim());
  const [name, setName] = useState(looksLikePhone ? "" : initial);
  const [phone, setPhone] = useState(looksLikePhone ? initial : "");
  const firstPlan = plans.find((p) => p.is_active)?.id ?? "";
  const [planId, setPlanId] = useState(firstPlan);
  const [pay, setPay] = useState<PaymentMethod>("cash");
  const [busy, setBusy] = useState(false);
  const plan = plans.find((p) => p.id === planId);

  async function submit() {
    setBusy(true);
    try {
      const r = await createMember({ name, phone, planId: planId || null, payment: plan && plan.price > 0 ? pay : null });
      if (r.sale && r.sale.amount > 0) playCoin();
      toast("success", `${r.member.full_name} is now member ${r.member.member_no}`);
      printCard(r);
      onDone(r);
    } catch (e) {
      toast("error", "Couldn't add member", errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name"><Input autoFocus={!looksLikePhone} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Brian Otieno" /></Field>
        <Field label="Phone"><Input autoFocus={looksLikePhone} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07…" inputMode="tel" /></Field>
      </div>
      <Field label="Plan"><PlanChoice plans={plans} value={planId} onChange={setPlanId} allowNone /></Field>
      {plan && plan.price > 0 && <Field label="Paid with"><Chips value={pay} onChange={setPay} options={PAY_OPTIONS} /></Field>}
      <div className="flex gap-2">
        {onCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button className="flex-1" loading={busy} disabled={!name.trim()} onClick={submit} icon={<UserPlus className="size-4" />}>
          {plan ? `Sign up · ${money(plan.price, settings?.currency)}` : "Save member"}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Renew                                                             */
/* ------------------------------------------------------------------ */
export function RenewForm({ member, onDone, onCancel }: { member: Member; onDone: (r: MemberResult) => void; onCancel?: () => void }) {
  const { plans, renewMember, settings } = useArcade();
  const now = useNow();
  const printCard = usePrintMembership();
  const toast = useToast();
  const active = plans.filter((p) => p.is_active);
  const [planId, setPlanId] = useState(active.find((p) => p.id === member.plan_id)?.id ?? active[0]?.id ?? "");
  const [pay, setPay] = useState<PaymentMethod>("cash");
  const [busy, setBusy] = useState(false);
  const plan = plans.find((p) => p.id === planId);
  const from = Math.max(now, member.expires_at ? Date.parse(member.expires_at) : 0);
  const until = plan ? new Date(from + plan.duration_days * 86_400_000) : null;

  async function submit() {
    if (!plan) return;
    setBusy(true);
    try {
      const r = await renewMember(member.id, plan.id, plan.price > 0 ? pay : null);
      if (plan.price > 0) playCoin();
      toast("success", `${member.full_name} renewed`, until ? `Valid until ${prettyDate(until)}` : undefined);
      printCard(r);
      onDone(r);
    } catch (e) {
      toast("error", "Couldn't renew", errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Field label="Plan"><PlanChoice plans={plans} value={planId} onChange={setPlanId} /></Field>
      {until && (
        <p className="rounded-2xl border border-line bg-white/[0.02] px-4 py-3 text-sm text-muted">
          Valid until <b className="text-white">{prettyDate(until)}</b>
          {member.expires_at && Date.parse(member.expires_at) > now && <span className="text-faint"> (added on top of the days left)</span>}
        </p>
      )}
      {plan && plan.price > 0 && <Field label="Paid with"><Chips value={pay} onChange={setPay} options={PAY_OPTIONS} /></Field>}
      <div className="flex gap-2">
        {onCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button className="flex-1" loading={busy} disabled={!plan} onClick={submit} icon={<RefreshCw className="size-4" />}>
          Renew{plan ? ` · ${money(plan.price, settings?.currency)}` : ""}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Find / pick a member (search by name, phone or member number)     */
/* ------------------------------------------------------------------ */
export function matchMembers(members: Member[], q: string) {
  const t = q.trim().toLowerCase();
  if (!t) return [];
  const digits = t.replace(/\D/g, "");
  return members.filter((m) =>
    m.full_name.toLowerCase().includes(t) ||
    m.member_no.toLowerCase() === t || m.member_no.toLowerCase().includes(t) ||
    (digits.length >= 3 && (m.phone ?? "").replace(/\D/g, "").includes(digits)),
  );
}

export function MemberPicker({ value, onChange }: { value: Member | null; onChange: (m: Member | null) => void }) {
  const { members, plans } = useArcade();
  const now = useNow();
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"search" | "new" | "renew">("search");
  const results = useMemo(() => matchMembers(members, q).slice(0, 6), [members, q]);
  // keep the selected member fresh (renewals, realtime edits)
  const sel = value ? members.find((m) => m.id === value.id) ?? value : null;

  if (sel && mode !== "renew") {
    const st = memberState(sel, now);
    const usable = st === "active" || st === "expiring";
    const plan = plans.find((p) => p.id === sel.plan_id);
    return (
      <div className={cn("rounded-2xl border p-3", usable ? "border-brand/40 bg-brand/[0.06]" : "border-bad/40 bg-bad/5")}>
        <div className="flex items-center gap-3">
          <MemberAvatar member={sel} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate font-semibold text-white"><Crown className="size-4 shrink-0 text-brand" />{sel.full_name}</p>
            <p className="truncate text-xs text-muted">{sel.member_no}{plan ? ` · ${plan.name}` : ""}{sel.phone ? ` · ${sel.phone}` : ""}</p>
          </div>
          <MemberStatus member={sel} now={now} />
          <button type="button" onClick={() => onChange(null)} className="rounded-lg p-1.5 text-faint hover:bg-white/5 hover:text-white" aria-label="Change member"><X className="size-4" /></button>
        </div>
        {!usable && (
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-bad/20 pt-3">
            <p className="text-sm text-bad">{st === "no-plan" ? "No plan yet." : st === "inactive" ? "Deactivated by an admin." : `Expired ${sel.expires_at ? prettyDate(sel.expires_at) : ""}.`} No member price until renewed.</p>
            {st !== "inactive" && <Button size="sm" onClick={() => setMode("renew")} icon={<RefreshCw className="size-4" />}>Renew</Button>}
          </div>
        )}
      </div>
    );
  }

  if (mode === "renew" && sel) {
    return (
      <div className="rounded-2xl border border-line p-4">
        <p className="mb-3 font-semibold">Renew {sel.full_name}</p>
        <RenewForm member={sel} onCancel={() => setMode("search")} onDone={(r) => { onChange(r.member); setMode("search"); }} />
      </div>
    );
  }

  if (mode === "new") {
    return (
      <div className="rounded-2xl border border-brand/30 p-4">
        <p className="mb-3 flex items-center gap-2 font-semibold"><UserPlus className="size-4 text-brand" />New member</p>
        <NewMemberForm initial={q} onCancel={() => setMode("search")} onDone={(r) => { onChange(r.member); setQ(""); setMode("search"); }} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            // scanners / Enter: pick an exact member-number match instantly
            if (e.key === "Enter" && results.length) { e.preventDefault(); onChange(results[0]); setQ(""); }
          }}
          placeholder="Name, phone or member no. (M0001)"
          className="pl-10"
        />
      </div>
      <AnimatePresence initial={false}>
        {results.map((m) => (
          <motion.button
            key={m.id}
            type="button"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            onClick={() => { onChange(m); setQ(""); }}
            className="flex w-full items-center gap-3 rounded-xl border border-line px-3 py-2 text-left transition hover:border-brand/40 hover:bg-white/[0.03]"
          >
            <MemberAvatar member={m} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-white">{m.full_name}</span>
              <span className="block truncate text-xs text-muted">{m.member_no}{m.phone ? ` · ${m.phone}` : ""}</span>
            </span>
            <MemberStatus member={m} now={now} />
          </motion.button>
        ))}
      </AnimatePresence>
      {q.trim() && !results.length && <p className="px-1 text-sm text-muted">No member matches “{q.trim()}”.</p>}
      <Button variant="outline" size="sm" icon={<UserPlus className="size-4" />} onClick={() => setMode("new")}>
        {q.trim() && !results.length ? "Sign them up" : "New member"}
      </Button>
    </div>
  );
}
