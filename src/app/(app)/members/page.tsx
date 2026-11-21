"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CalendarClock, Crown, Printer, RefreshCw, Search, ShieldCheck, Timer, UserPlus, Users, X } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { useArcade, useNow } from "@/components/arcade-provider";
import { usePrintMembership } from "@/components/member-print";
import { MemberAvatar, MemberStatus, NewMemberForm, RenewForm, matchMembers } from "@/components/member-ui";
import { Emblem } from "@/components/emblem";
import { useToast } from "@/components/toast";
import { AnimatedNumber, Button, Chips, Empty, Field, Input, Sheet, Stat, StatusPill, Toggle } from "@/components/ui";
import { cn, duration, errorMessage, hm, money, prettyDate, ymd } from "@/lib/format";
import { daysLeft, memberState, planLength, type MemberState } from "@/lib/membership";
import type { Member, MembershipPlan, MembershipSale, Session } from "@/lib/types";

type Filter = "all" | "active" | "expiring" | "expired" | "no-plan";

export default function MembersPage() {
  const { members, plans } = useArcade();
  const now = useNow();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<{ id: string; renew?: boolean } | null>(null);
  const [adding, setAdding] = useState(false);

  const counts = useMemo(() => {
    const c: Record<MemberState, number> = { active: 0, expiring: 0, expired: 0, "no-plan": 0, inactive: 0 };
    members.forEach((m) => c[memberState(m, now)]++);
    const monthStart = new Date(now); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const joined = members.filter((m) => Date.parse(m.joined_at) >= monthStart.getTime()).length;
    return { ...c, joined };
  }, [members, now]);

  const list = useMemo(() => {
    const base = q.trim() ? matchMembers(members, q) : members;
    return base.filter((m) => {
      const st = memberState(m, now);
      if (filter === "all") return st !== "inactive" || !!q.trim();
      if (filter === "active") return st === "active" || st === "expiring";
      return st === filter;
    });
  }, [members, q, filter, now]);

  const current = open ? members.find((m) => m.id === open.id) ?? null : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.25em] text-brand">Members</p>
          <h1 className="mt-1 font-display text-3xl font-bold sm:text-4xl">The crew</h1>
          <p className="mt-1 text-sm text-muted">Members get their plan&apos;s discount automatically when you pick them on the Start sheet.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-0 flex-1 sm:w-80 sm:flex-none">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone or member no." className="pl-10 pr-9" />
            {q && <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-faint hover:text-white" aria-label="Clear search"><X className="size-4" /></button>}
          </div>
          <Button icon={<UserPlus className="size-4" />} onClick={() => setAdding(true)}>New member</Button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Stat accent label="Active members" icon={<Crown className="size-4" />} value={<AnimatedNumber value={counts.active + counts.expiring} />} sub={`${members.length} on file`} />
        <Stat label="Expiring soon" icon={<CalendarClock className="size-4" />} value={<AnimatedNumber value={counts.expiring} />} sub="within 3 days" />
        <Stat label="Expired" icon={<Timer className="size-4" />} value={<AnimatedNumber value={counts.expired} />} sub="renew to win them back" />
        <Stat label="Joined this month" icon={<Users className="size-4" />} value={<AnimatedNumber value={counts.joined} />} sub={plans.filter((p) => p.is_active).length + " plans on offer"} />
      </section>

      <Chips<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All" },
          { value: "active", label: `Active · ${counts.active + counts.expiring}` },
          { value: "expiring", label: `Expiring · ${counts.expiring}` },
          { value: "expired", label: `Expired · ${counts.expired}` },
          { value: "no-plan", label: `No plan · ${counts["no-plan"]}` },
        ]}
      />

      {list.length === 0 ? (
        <Empty
          icon={<Crown className="size-7" />}
          title={members.length ? "No members match" : "No members yet"}
          body={members.length ? "Try another name, phone or filter." : "Sign up your regulars so they get member prices and you can see who keeps coming back."}
          action={!members.length ? <Button icon={<UserPlus className="size-4" />} onClick={() => setAdding(true)}>Add the first member</Button> : undefined}
        />
      ) : (
        <motion.ul layout className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence initial={false}>
            {list.slice(0, 300).map((m, i) => (
              <motion.li key={m.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ delay: Math.min(i, 12) * 0.02 }}>
                <MemberRow member={m} plan={plans.find((p) => p.id === m.plan_id)} now={now}
                  onOpen={() => setOpen({ id: m.id })} onRenew={() => setOpen({ id: m.id, renew: true })} />
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title={<>New <span className="text-brand">member</span></>} subtitle="Takes 20 seconds. A member card prints with their number.">
        {adding && <NewMemberForm initial={q} onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />}
      </Sheet>
      <MemberSheet key={current ? current.id + (open?.renew ? ":r" : "") : "none"} member={current} startRenew={!!open?.renew} onClose={() => setOpen(null)} />
    </div>
  );
}

function MemberRow({ member: m, plan, now, onOpen, onRenew }: { member: Member; plan?: MembershipPlan; now: number; onOpen: () => void; onRenew: () => void }) {
  const st = memberState(m, now);
  const total = plan ? plan.duration_days : 30;
  const left = daysLeft(m, now);
  const pct = m.expires_at ? Math.max(0, Math.min(1, left / total)) : 0;
  const needsRenew = st === "expired" || st === "expiring" || st === "no-plan";
  return (
    <div className="group relative rounded-2xl border border-line bg-panel/80 p-4 transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-[0_12px_40px_-16px_rgb(248_244_0/0.35)]">
      <button onClick={onOpen} className="absolute inset-0 rounded-2xl" aria-label={`Open ${m.full_name}`} />
      <div className="pointer-events-none flex items-start gap-3">
        <MemberAvatar member={m} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-white">{m.full_name}</p>
          <p className="truncate text-xs text-muted"><span className="font-mono">{m.member_no}</span>{m.phone ? ` · ${m.phone}` : ""}</p>
        </div>
        <MemberStatus member={m} now={now} />
      </div>
      <div className="pointer-events-none mt-4">
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-semibold text-brand">{plan?.name ?? "No plan"}{plan?.discount_pct ? <span className="font-normal text-muted"> · {plan.discount_pct}% off</span> : null}</span>
          <span className="text-faint">{m.expires_at ? (st === "expired" ? `ended ${ymd(m.expires_at)}` : `until ${ymd(m.expires_at)}`) : "—"}</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <motion.div
            className={cn("h-full rounded-full", st === "expiring" ? "bg-warn" : st === "expired" ? "bg-bad" : "bg-brand")}
            initial={{ width: 0 }}
            animate={{ width: `${(st === "expired" ? 1 : pct) * 100}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>
      </div>
      {needsRenew && m.is_active && (
        <Button size="sm" variant={st === "expired" || st === "no-plan" ? "primary" : "outline"} className="relative mt-3 w-full" icon={<RefreshCw className="size-4" />} onClick={onRenew}>
          {st === "no-plan" ? "Choose a plan" : "Renew"}
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
function MemberCardVisual({ member: m, plan }: { member: Member; plan?: MembershipPlan }) {
  return (
    <motion.div
      initial={{ rotateX: 18, opacity: 0, y: 12 }}
      animate={{ rotateX: 0, opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 180, damping: 18 }}
      className="relative aspect-[1.586] w-full max-w-[340px] overflow-hidden rounded-3xl border border-brand/30 bg-gradient-to-br from-[#1d1d10] via-[#0e0e10] to-black p-5 shadow-[0_30px_60px_-25px_rgb(248_244_0/0.45)]"
    >
      <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-brand/15 blur-3xl" />
      <motion.div
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
        initial={{ x: "-120%" }}
        animate={{ x: "120%" }}
        transition={{ duration: 1.6, delay: 0.4, ease: "easeInOut" }}
      />
      <div className="relative flex h-full flex-col">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><Emblem size={30} /><span className="font-display text-sm font-bold tracking-wide">DARKROOM</span></div>
          <span className="rounded-full border border-brand/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-brand">{plan?.name ?? "Member"}</span>
        </div>
        <p className="mt-auto font-mono text-2xl font-bold tracking-[0.2em] text-brand glow-text">{m.member_no}</p>
        <div className="mt-1 flex items-end justify-between gap-2">
          <p className="truncate font-display text-lg font-semibold uppercase tracking-wide">{m.full_name}</p>
          <p className="shrink-0 text-right text-[10px] uppercase tracking-widest text-muted">Valid thru<br /><span className="font-mono text-sm text-white">{m.expires_at ? ymd(m.expires_at).slice(2).replace(/-/g, "/") : "--/--/--"}</span></p>
        </div>
      </div>
    </motion.div>
  );
}

function MemberSheet({ member, startRenew, onClose }: { member: Member | null; startRenew: boolean; onClose: () => void }) {
  const { plans, isAdmin, updateMember, adminUpdateMember, settings } = useArcade();
  const now = useNow();
  const toast = useToast();
  const printCard = usePrintMembership();
  const [mode, setMode] = useState<"view" | "renew">(startRenew ? "renew" : "view");
  const [name, setName] = useState(member?.full_name ?? "");
  const [phone, setPhone] = useState(member?.phone ?? "");
  const [notes, setNotes] = useState(member?.notes ?? "");
  const [expiry, setExpiry] = useState(member?.expires_at ? ymd(member.expires_at) : "");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<{ sessions: Session[]; sales: MembershipSale[] } | null>(null);
  const cur = settings?.currency ?? "KES";

  useEffect(() => {
    if (!member) return;
    let off = false;
    const sb = getSupabase();
    Promise.all([
      sb.from("sessions").select("*").eq("member_id", member.id).order("started_at", { ascending: false }).limit(200),
      sb.from("membership_sales").select("*").eq("member_id", member.id).order("created_at", { ascending: false }),
    ]).then(([s, m]) => {
      if (!off) setHistory({ sessions: (s.data as Session[]) ?? [], sales: (m.data as MembershipSale[]) ?? [] });
    });
    return () => { off = true; };
  }, [member]);

  if (!member) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  const plan = plans.find((p) => p.id === member.plan_id);
  const dirty = name !== member.full_name || phone !== (member.phone ?? "") || notes !== (member.notes ?? "");
  const paid = history?.sessions.filter((s) => s.status === "completed") ?? [];
  const stats = {
    visits: paid.length,
    minutes: paid.reduce((a, s) => a + (s.played_minutes ?? 0), 0),
    spent: paid.reduce((a, s) => a + Number(s.amount ?? 0), 0) + (history?.sales.reduce((a, s) => a + Number(s.amount), 0) ?? 0),
    saved: paid.reduce((a, s) => a + Number(s.member_discount ?? 0), 0),
  };

  async function save() {
    if (!member) return;
    setBusy(true);
    try {
      await updateMember(member.id, { full_name: name.trim(), phone: phone.trim() || null, notes: notes.trim() || null });
      toast("success", "Member updated");
    } catch (e) {
      toast("error", "Couldn't save", errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function adminSave(active: boolean, exp: string) {
    if (!member) return;
    try {
      await adminUpdateMember(member.id, exp ? new Date(exp + "T23:59:59").toISOString() : null, active);
      toast("success", active ? "Membership updated" : `${member.full_name} deactivated`);
    } catch (e) {
      toast("error", "Couldn't update", errorMessage(e));
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      wide
      title={<span className="flex items-center gap-2"><Crown className="size-5 text-brand" />{member.full_name}</span>}
      subtitle={`${member.member_no} · joined ${prettyDate(member.joined_at)}${member.created_by_name ? ` by ${member.created_by_name}` : ""}`}
      footer={mode === "view" ? (
        <div className="flex flex-wrap gap-2">
          <Button className="flex-1" icon={<RefreshCw className="size-4" />} onClick={() => setMode("renew")} disabled={!member.is_active}>
            {member.expires_at ? "Renew / change plan" : "Choose a plan"}
          </Button>
          <Button variant="outline" icon={<Printer className="size-4" />} onClick={() => printCard({ member, sale: null })}>Print member card</Button>
        </div>
      ) : undefined}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div style={{ perspective: 900 }}><MemberCardVisual member={member} plan={plan} /></div>
          <div className="flex items-center gap-2"><MemberStatus member={member} now={now} />
            {plan && <span className="text-sm text-muted">{plan.name} · {planLength(plan.duration_days)}{plan.discount_pct ? ` · ${plan.discount_pct}% off` : ""}</span>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { k: "Visits", v: String(stats.visits) },
              { k: "Played", v: duration(stats.minutes) },
              { k: "Spent", v: money(stats.spent, cur) },
              { k: "Saved", v: money(stats.saved, cur) },
            ].map((x) => (
              <div key={x.k} className="rounded-2xl border border-line bg-white/[0.02] px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-faint">{x.k}</p>
                <p className="font-display text-lg font-bold tabular-nums">{history ? x.v : "…"}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          {mode === "renew" ? (
            <div className="rounded-2xl border border-brand/30 p-4">
              <p className="mb-3 font-semibold">{member.expires_at ? "Renew membership" : "Choose a plan"}</p>
              <RenewForm member={member} onCancel={() => setMode("view")} onDone={() => setMode("view")} />
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Full name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
                <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" /></Field>
                <Field label="Notes" className="sm:col-span-2"><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. FC 27 regular, prefers screen C" /></Field>
              </div>
              {dirty && <Button variant="subtle" loading={busy} disabled={!name.trim()} onClick={save}>Save changes</Button>}
            </>
          )}

          {isAdmin && mode === "view" && (
            <div className="space-y-3 rounded-2xl border border-line p-4">
              <p className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4 text-brand" />Admin corrections</p>
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Valid until" className="flex-1">
                  <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
                </Field>
                <Button variant="subtle" disabled={expiry === (member.expires_at ? ymd(member.expires_at) : "")} onClick={() => adminSave(member.is_active, expiry)}>Set date</Button>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted">{member.is_active ? "Active member: can get member prices" : "Deactivated: treated as a walk-in"}</span>
                <Toggle on={member.is_active} onChange={(v) => adminSave(v, member.expires_at ? ymd(member.expires_at) : "")} />
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Recent visits</p>
            {!history ? <div className="h-16 animate-pulse rounded-2xl bg-white/[0.03]" /> : history.sessions.length === 0 ? (
              <p className="text-sm text-faint">No visits yet.</p>
            ) : (
              <ul className="divide-y divide-line rounded-2xl border border-line">
                {history.sessions.slice(0, 6).map((s) => (
                  <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="grid size-8 place-items-center rounded-lg bg-white/[0.05] font-display font-bold text-brand">{s.screen_code}</span>
                    <span className="min-w-0 flex-1 truncate">{s.game_title} <span className="text-xs text-faint">· {ymd(s.started_at)} {hm(s.started_at)}</span></span>
                    {s.status === "completed" ? <span className="tabular-nums">{money(s.amount, cur)}</span> : <StatusPill status={s.status} />}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {history && history.sales.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Membership history</p>
              <ul className="space-y-1.5 text-sm">
                {history.sales.map((sale) => (
                  <li key={sale.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2">
                    <span className="min-w-0 truncate">
                      <span className="font-semibold">{sale.kind === "join" ? "Joined" : "Renewed"} · {sale.plan_name}</span>
                      <span className="text-xs text-faint"> · {ymd(sale.period_start)} → {ymd(sale.period_end)}</span>
                    </span>
                    <button className="shrink-0 tabular-nums text-brand hover:underline" onClick={() => printCard({ member, sale })} title="Reprint receipt">{money(sale.amount, cur)}</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
