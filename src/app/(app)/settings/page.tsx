"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Bell, Check, Crown, Gamepad2, Monitor, Plus, Printer, Save, Smartphone, Store, Trash2, Users, Volume2, Wallet,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { useArcade } from "@/components/arcade-provider";
import { readPrintPrefs, savePrintPrefs, usePrint, type PrintPrefs } from "@/components/print";
import { Receipt } from "@/components/receipt";
import { OffersEditor, PlansEditor } from "@/components/membership-settings";
import { useInstall } from "@/components/install-button";
import { useToast } from "@/components/toast";
import { Button, Chips, Field, Input, Toggle, ToggleRow } from "@/components/ui";
import { billableMinutes, priceFor } from "@/lib/billing";
import { cn, duration, errorMessage, money } from "@/lib/format";
import { playStart, setSoundEnabled, soundEnabled } from "@/lib/sound";
import type { Game, Profile, Role, Screen, Session, Settings } from "@/lib/types";

type Tab = "shop" | "pricing" | "membership" | "screens" | "games" | "team" | "device";
const TABS: { id: Tab; label: string; icon: typeof Store; admin?: boolean }[] = [
  { id: "shop", label: "Shop & receipt", icon: Store, admin: true },
  { id: "pricing", label: "Pricing", icon: Wallet, admin: true },
  { id: "membership", label: "Membership", icon: Crown, admin: true },
  { id: "screens", label: "Screens", icon: Monitor, admin: true },
  { id: "games", label: "Games", icon: Gamepad2, admin: true },
  { id: "team", label: "Team", icon: Users, admin: true },
  { id: "device", label: "This device", icon: Smartphone },
];

export default function SettingsPage() {
  const { isAdmin } = useArcade();
  const tabs = TABS.filter((t) => !t.admin || isAdmin);
  const [tab, setTab] = useState<Tab>(isAdmin ? "shop" : "device");

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium uppercase tracking-[0.25em] text-brand">Settings</p>
        <h1 className="mt-1 font-display text-3xl font-bold sm:text-4xl">Control room</h1>
        {!isAdmin && <p className="mt-1 text-sm text-muted">Only admins can change shop settings. You can adjust this device below.</p>}
      </header>
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-1 rounded-2xl border border-line bg-panel/80 p-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)} className={cn("relative flex h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-medium", tab === id ? "text-black" : "text-muted hover:text-white")}>
              {tab === id && <motion.span layoutId="settings-tab" className="absolute inset-0 rounded-xl bg-brand" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
              <Icon className="relative size-4" />
              <span className="relative whitespace-nowrap">{label}</span>
            </button>
          ))}
        </div>
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
          {tab === "shop" && <ShopTab />}
          {tab === "pricing" && <PricingTab />}
          {tab === "membership" && <MembershipTab />}
          {tab === "screens" && <ScreensTab />}
          {tab === "games" && <GamesTab />}
          {tab === "team" && <TeamTab />}
          {tab === "device" && <DeviceTab />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Card({ title, sub, children, className }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-3xl border border-line bg-panel/80 p-5 sm:p-6", className)}>
      <h2 className="font-display text-lg font-bold">{title}</h2>
      {sub && <p className="text-sm text-muted">{sub}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

/* Settings form state shared by shop + pricing ---------------------- */
function useSettingsForm() {
  const { settings, setSettings } = useArcade();
  const toast = useToast();
  // Re-seed the form whenever the saved settings change (save, realtime update)
  const [seed, setSeed] = useState(settings);
  const [form, setForm] = useState<Settings | null>(settings);
  const [busy, setBusy] = useState(false);
  if (seed !== settings) {
    setSeed(settings);
    setForm(settings);
  }
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const dirty = JSON.stringify(form) !== JSON.stringify(settings);
  async function save() {
    if (!form) return;
    setBusy(true);
    const patch: Partial<Settings> = { ...form };
    delete patch.id;
    delete patch.updated_at;
    const { data, error } = await getSupabase().from("settings").update(patch).eq("id", 1).select().single();
    setBusy(false);
    if (error) return toast("error", "Couldn't save settings", errorMessage(error));
    setSettings(data as Settings);
    toast("success", "Settings saved");
  }
  return { form, set, dirty, busy, save };
}

function SaveBar({ dirty, busy, save }: { dirty: boolean; busy: boolean; save: () => void }) {
  return (
    <AnimatePresence>
      {dirty && (
        <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} className="fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-brand/30 bg-panel/95 p-3 pl-5 shadow-2xl backdrop-blur lg:bottom-6 lg:left-64">
          <span className="text-sm text-muted">Unsaved changes</span>
          <Button loading={busy} onClick={save} icon={<Save className="size-4" />}>Save</Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const SAMPLE: Session = {
  id: "preview", receipt_no: 15519, receipt_code: "DKR15519", team_code: "0", customer_name: null, customer_phone: null,
  players: 2, screen_id: null, screen_code: "E", console: "PS5", game_title: "FC 27", started_at: new Date().toISOString(),
  planned_minutes: 60, extended_minutes: 0, prepaid_amount: 200, paused_at: null, paused_seconds: 0, ended_at: null, status: "active", hourly_rate: 200,
  played_minutes: null, billed_minutes: null, gross_amount: null, discount: 0, amount: null, payment_method: "mpesa",
  notes: null, cancel_reason: null, staff_name: "Reception", closed_by_name: null, created_at: "", updated_at: "",
  member_id: null, member_no: null, member_name: null, member_plan: null, member_expires_at: null, member_discount_pct: 0,
  offer_title: null, member_discount: 0,
};

function MembershipTab() {
  const { form, set, dirty, busy, save } = useSettingsForm();
  if (!form) return null;
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <Card title="Membership plans" sub="How long a membership lasts, what it costs, and the discount members get on every hour. Staff pick a plan when signing someone up or renewing.">
          <PlansEditor />
        </Card>
        <Card title="Member offers" sub="Extra discounts at certain days and times (e.g. weekday happy hour), or perks printed on receipts. Discounts apply automatically.">
          <OffersEditor />
        </Card>
        <Card title="Receipts & timezone">
          <div className="space-y-4">
            <ToggleRow title="Advertise membership on walk-in receipts" sub="Adds a “Become a member” box with your plans, perks and what they would have saved." on={form.receipt_show_membership} onChange={(v) => set("receipt_show_membership", v)} />
            <Field label="Message"><Input value={form.membership_pitch ?? ""} onChange={(e) => set("membership_pitch", e.target.value || null)} /></Field>
            <Field label="Shop timezone" hint="used for offer days & times">
              <Chips value={form.timezone} onChange={(v) => set("timezone", v)} options={["Africa/Nairobi", "Africa/Kampala", "Africa/Dar_es_Salaam", "Africa/Lagos", "UTC"].map((t) => ({ value: t, label: t.replace("Africa/", "").replace("_", " ") }))} />
            </Field>
          </div>
        </Card>
      </div>
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-faint">Walk-in receipt preview</p>
        <div className="paper-tear-bottom overflow-hidden rounded-t-lg shadow-2xl shadow-black/60 xl:sticky xl:top-6">
          <Receipt session={{ ...SAMPLE, status: "completed", ended_at: new Date(Date.parse(SAMPLE.started_at) + 3_600_000).toISOString(), played_minutes: 60, billed_minutes: 60, gross_amount: 200, amount: 200 }} settings={form} kind="final" copy="CUSTOMER COPY" />
        </div>
      </div>
      <SaveBar dirty={dirty} busy={busy} save={save} />
    </div>
  );
}

function ShopTab() {
  const { form, set, dirty, busy, save } = useSettingsForm();
  if (!form) return null;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <Card title="Shop details" sub="Printed on every receipt">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Shop name"><Input value={form.shop_name} onChange={(e) => set("shop_name", e.target.value)} /></Field>
          <Field label="Tagline"><Input value={form.tagline ?? ""} onChange={(e) => set("tagline", e.target.value || null)} /></Field>
          <Field label="Location"><Input value={form.location ?? ""} onChange={(e) => set("location", e.target.value || null)} placeholder="e.g. 2nd floor, City Mall" /></Field>
          <Field label="Phone"><Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value || null)} /></Field>
          <Field label="Receipt prefix" hint="DKR15519"><Input value={form.receipt_prefix} onChange={(e) => set("receipt_prefix", e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 6))} /></Field>
          <div />
          <Field label="Ticket note" className="sm:col-span-2"><Input value={form.receipt_note ?? ""} onChange={(e) => set("receipt_note", e.target.value || null)} /></Field>
          <Field label="Footer" className="sm:col-span-2"><Input value={form.receipt_footer ?? ""} onChange={(e) => set("receipt_footer", e.target.value || null)} /></Field>
        </div>
      </Card>
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-faint">Live preview</p>
        <div className="paper-tear-bottom overflow-hidden rounded-t-lg shadow-2xl shadow-black/60">
          <Receipt session={{ ...SAMPLE, receipt_code: form.receipt_prefix + "15519", hourly_rate: form.default_hourly_rate }} settings={form} kind="ticket" copy="CUSTOMER COPY" />
        </div>
      </div>
      <SaveBar dirty={dirty} busy={busy} save={save} />
    </div>
  );
}

function PricingTab() {
  const { form, set, dirty, busy, save } = useSettingsForm();
  if (!form) return null;
  const num = (v: string) => Math.max(0, Number(v) || 0);
  const rate = form.default_hourly_rate;
  const cur = form.currency;
  const perHour = form.billing_increment_minutes >= 60;
  // Booked (null = open time) → actually played
  const examples: { booked: number | null; played: number }[] = [
    { booked: 60, played: 60 },
    { booked: 60, played: 60 + form.grace_minutes + 2 },
    { booked: 120, played: 75 },
    { booked: null, played: 40 },
    { booked: null, played: 95 },
  ];
  const charge = (booked: number | null, played: number) => {
    let b = billableMinutes(played, form);
    if (form.charge_booked_time && booked) b = Math.max(b, billableMinutes(booked, form));
    return b;
  };
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Rates & billing" sub="How playing time turns into money. Applied by the server at checkout.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Currency"><Input value={form.currency} onChange={(e) => set("currency", e.target.value.toUpperCase().slice(0, 4))} /></Field>
          <Field label="Rate per hour" hint="screens can override"><Input type="number" inputMode="decimal" value={form.default_hourly_rate} onChange={(e) => set("default_hourly_rate", num(e.target.value))} /></Field>
          <Field label="Charge per" className="sm:col-span-2">
            <Chips value={form.billing_increment_minutes} onChange={(v) => set("billing_increment_minutes", v)} options={[{ value: 60, label: "Hour" }, { value: 30, label: "Half hour" }, { value: 15, label: "15 min" }, { value: 1, label: "Minute" }]} />
          </Field>
          <Field label="Minimum charge" className="sm:col-span-2">
            <Chips value={form.minimum_minutes} onChange={(v) => set("minimum_minutes", v)} options={[0, 30, 60, 120].map((v) => ({ value: v, label: v ? duration(v) : "None" }))} />
          </Field>
          <Field label="Grace period" hint="minutes"><Input type="number" value={form.grace_minutes} onChange={(e) => set("grace_minutes", Math.min(30, num(e.target.value)))} /></Field>
          <Field label="Warn before end" hint="minutes"><Input type="number" value={form.warn_before_minutes} onChange={(e) => set("warn_before_minutes", Math.min(60, num(e.target.value)))} /></Field>
          <p className="text-xs text-faint sm:col-span-2">Grace: minutes a customer can run over before the next {perHour ? "hour" : "block"} is charged.</p>
        </div>
      </Card>

      <Card title="What customers pay" sub="Worked examples with the rules on this page">
        <ul className="divide-y divide-line">
          {examples.map((x, i) => {
            const b = charge(x.booked, x.played);
            return (
              <li key={i} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="text-muted">
                  {x.booked ? <>Books <b className="text-white">{duration(x.booked)}</b>, plays {duration(x.played)}</> : <>Open time, plays <b className="text-white">{duration(x.played)}</b></>}
                  <span className="text-faint"> → {duration(b)}</span>
                </span>
                <span className="shrink-0 font-display font-bold text-brand tabular-nums">{money(priceFor(b, rate), cur)}</span>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-faint">No per-game or per-match pricing: every game is charged by time at the screen&apos;s hourly rate.</p>
      </Card>

      <Card title="Booking & payment rules" sub="How the front desk runs a session">
        <div className="space-y-3">
          <ToggleRow title="Allow open time" sub="Customers can play without booking hours and pay on exit. Off = staff must choose hours." on={form.allow_open_time} onChange={(v) => set("allow_open_time", v)} />
          <ToggleRow title="Charge booked hours in full" sub="A customer who books 2 hours and leaves after 1h 20m still pays for 2 hours." on={form.charge_booked_time} onChange={(v) => set("charge_booked_time", v)} />
          <ToggleRow title="Pay upfront by default" sub="“Collect payment now” starts switched on when starting a session or adding time." on={form.prepay_default} onChange={(v) => set("prepay_default", v)} />
        </div>
      </Card>

      <Card title="Staff limits" sub="Admins are never limited. The server enforces these, so they can't be bypassed.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Max discount %" hint="0 = admins only">
            <Input type="number" inputMode="numeric" value={form.staff_max_discount_pct} onChange={(e) => set("staff_max_discount_pct", Math.min(100, Math.round(num(e.target.value))))} />
          </Field>
          <Field label="Void window (min)" hint="0 = admins only">
            <Input type="number" inputMode="numeric" value={form.staff_void_window_minutes} onChange={(e) => set("staff_void_window_minutes", Math.min(1440, Math.round(num(e.target.value))))} />
          </Field>
        </div>
        <p className="mt-3 text-sm text-muted">
          Staff may discount up to <b className="text-white">{form.staff_max_discount_pct}%</b> of a bill and void a receipt within{" "}
          <b className="text-white">{form.staff_void_window_minutes} min</b> of its start. Anything beyond that needs an admin.
        </p>
        <p className="mt-3 text-xs text-faint">Every start, pause, added hour, move, payment, refund and void is written to each receipt&apos;s activity log with the staff member&apos;s name.</p>
      </Card>
      <SaveBar dirty={dirty} busy={busy} save={save} />
    </div>
  );
}

function ScreensTab() {
  const { screens, setScreens, settings, liveByScreen } = useArcade();
  const toast = useToast();
  const sb = getSupabase();

  async function patch(id: string, p: Partial<Screen>) {
    const { data, error } = await sb.from("screens").update(p).eq("id", id).select().single();
    if (error) return toast("error", "Couldn't update screen", errorMessage(error));
    setScreens(screens.map((s) => (s.id === id ? (data as Screen) : s)));
  }
  async function add() {
    const used = new Set(screens.map((s) => s.code));
    let code = "";
    for (let i = 0; i < 26 && !code; i++) if (!used.has(String.fromCharCode(65 + i))) code = String.fromCharCode(65 + i);
    if (!code) code = `S${screens.length + 1}`;
    const { data, error } = await sb.from("screens").insert({ code, sort_order: screens.length + 1 }).select().single();
    if (error) return toast("error", "Couldn't add screen", errorMessage(error));
    setScreens([...screens, data as Screen]);
    toast("success", `Screen ${code} added`);
  }
  async function remove(s: Screen) {
    if (liveByScreen.has(s.id)) return toast("error", "Screen is in use", "End the session first.");
    if (!confirm(`Delete screen ${s.code}? Screens with past receipts can only be disabled.`)) return;
    const { error } = await sb.from("screens").delete().eq("id", s.id);
    if (error) return toast("error", "Can't delete — it has receipts", "Turn it off instead to hide it from the floor.");
    setScreens(screens.filter((x) => x.id !== s.id));
  }

  return (
    <Card title="Screens" sub="Each screen is a station on the floor">
      <div className="space-y-2">
        {screens.map((s) => (
          <motion.div layout key={s.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border border-line p-3 sm:grid-cols-[auto_1fr_120px_140px_auto_auto]">
            <Input defaultValue={s.code} onBlur={(e) => e.target.value.trim() && e.target.value !== s.code && patch(s.id, { code: e.target.value.trim().toUpperCase() })} className="w-14 text-center font-display text-lg font-bold text-brand" aria-label="Code" />
            <Input defaultValue={s.name ?? ""} placeholder={`Screen ${s.code} label (optional)`} onBlur={(e) => e.target.value !== (s.name ?? "") && patch(s.id, { name: e.target.value || null })} />
            <Input defaultValue={s.console} placeholder="Console" onBlur={(e) => e.target.value && e.target.value !== s.console && patch(s.id, { console: e.target.value })} className="col-span-2 sm:col-span-1" />
            <Input type="number" defaultValue={s.hourly_rate ?? ""} placeholder={`${settings?.default_hourly_rate ?? ""}/hr`} onBlur={(e) => patch(s.id, { hourly_rate: e.target.value === "" ? null : Number(e.target.value) })} aria-label="Rate override" />
            <Toggle on={s.is_active} onChange={(v) => patch(s.id, { is_active: v })} label={s.is_active ? "On" : "Off"} />
            <button onClick={() => remove(s)} className="rounded-xl p-2.5 text-faint hover:bg-bad/10 hover:text-bad" aria-label={`Delete screen ${s.code}`}><Trash2 className="size-4" /></button>
          </motion.div>
        ))}
      </div>
      <Button variant="outline" className="mt-4" icon={<Plus className="size-4" />} onClick={add}>Add screen</Button>
    </Card>
  );
}

function GamesTab() {
  const { games, setGames } = useArcade();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const sb = getSupabase();

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const { data, error } = await sb.from("games").insert({ title: title.trim(), sort_order: games.length + 1 }).select().single();
    if (error) return toast("error", "Couldn't add game", errorMessage(error));
    setGames([...games, data as Game]);
    setTitle("");
  }
  async function toggle(g: Game) {
    const { data, error } = await sb.from("games").update({ is_active: !g.is_active }).eq("id", g.id).select().single();
    if (error) return toast("error", "Couldn't update", errorMessage(error));
    setGames(games.map((x) => (x.id === g.id ? (data as Game) : x)));
  }
  async function remove(g: Game) {
    const { error } = await sb.from("games").delete().eq("id", g.id);
    if (error) return toast("error", "Couldn't delete", errorMessage(error));
    setGames(games.filter((x) => x.id !== g.id));
  }

  return (
    <Card title="Game library" sub="Shown as quick picks when starting a session. Receipts keep the title even if you delete a game.">
      <form onSubmit={add} className="mb-4 flex gap-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a game e.g. EA FC 27" />
        <Button type="submit" icon={<Plus className="size-4" />}>Add</Button>
      </form>
      <div className="flex flex-wrap gap-2">
        <AnimatePresence>
          {games.map((g) => (
            <motion.span key={g.id} layout initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
              className={cn("inline-flex items-center gap-1 rounded-xl border py-1 pl-3 pr-1 text-sm", g.is_active ? "border-brand/30 bg-brand/[0.06] text-white" : "border-line text-faint line-through")}>
              <button onClick={() => toggle(g)} title={g.is_active ? "Hide from quick picks" : "Show in quick picks"}>{g.title}</button>
              <button onClick={() => remove(g)} className="rounded-lg p-1.5 text-faint hover:bg-bad/10 hover:text-bad" aria-label={`Delete ${g.title}`}><Trash2 className="size-3.5" /></button>
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
    </Card>
  );
}

function TeamTab() {
  const { profile: me } = useArcade();
  const toast = useToast();
  const [people, setPeople] = useState<Profile[]>([]);
  useEffect(() => {
    getSupabase().from("profiles").select("*").order("created_at").then(({ data }) => setPeople((data as Profile[]) ?? []));
  }, []);

  async function setRole(p: Profile, role: Role) {
    const { data, error } = await getSupabase().from("profiles").update({ role }).eq("id", p.id).select().single();
    if (error) return toast("error", "Couldn't change role", errorMessage(error));
    setPeople((list) => list.map((x) => (x.id === p.id ? (data as Profile) : x)));
    toast("success", `${p.full_name ?? p.email} is now ${role}`);
  }

  const pending = people.filter((p) => p.role === "pending");
  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <Card title={`Waiting for approval (${pending.length})`} sub="New sign-ups can't see anything until approved" className="border-brand/30">
          <ul className="space-y-2">
            {pending.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/[0.03] p-3">
                <div><p className="font-semibold">{p.full_name}</p><p className="text-sm text-muted">{p.email}</p></div>
                <div className="flex gap-2">
                  <Button size="sm" icon={<Check className="size-4" />} onClick={() => setRole(p, "staff")}>Approve</Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card title="Team" sub="Admins manage settings; staff run sessions and reports. To remove someone completely, delete them in Supabase → Authentication.">
        <ul className="divide-y divide-line">
          {people.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-full bg-white/[0.06] font-display font-bold uppercase text-brand">{(p.full_name ?? p.email ?? "?")[0]}</span>
                <div><p className="font-semibold">{p.full_name} {p.id === me?.id && <span className="text-xs text-faint">(you)</span>}</p><p className="text-sm text-muted">{p.email}</p></div>
              </div>
              <Chips<Role>
                value={p.role}
                onChange={(r) => p.id !== me?.id && setRole(p, r)}
                options={[{ value: "admin", label: "Admin" }, { value: "staff", label: "Staff" }, { value: "pending", label: "Blocked" }]}
                className={p.id === me?.id ? "pointer-events-none opacity-60" : ""}
              />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function DeviceTab() {
  const { settings } = useArcade();
  const print = usePrint();
  const { canInstall, install, standalone, ios } = useInstall();
  // Rendered client-side only (behind the app shell), so browser APIs are safe here
  const [prefs, setPrefs] = useState<PrintPrefs>(readPrintPrefs);
  const [sound, setSound] = useState(soundEnabled);
  const [notif, setNotif] = useState<string>(() => ("Notification" in window ? Notification.permission : "unsupported"));
  const update = (p: Partial<PrintPrefs>) => { const n = { ...prefs, ...p }; setPrefs(n); savePrintPrefs(n); };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Receipt printer" sub="Saved on this device only — each till can differ">
        <div className="space-y-5">
          <Field label="Paper"><Chips value={prefs.paper} onChange={(v) => update({ paper: v })} options={[{ value: "80", label: "80 mm thermal" }, { value: "58", label: "58 mm thermal" }, { value: "a4", label: "A4 / Letter" }]} /></Field>
          <Field label="Copies"><Chips value={prefs.copies} onChange={(v) => update({ copies: v })} options={[{ value: "both", label: "Customer + shop" }, { value: "customer", label: "Customer only" }]} /></Field>
          <div className="flex items-center justify-between rounded-2xl border border-line p-4">
            <div><p className="font-semibold">Auto-print</p><p className="text-sm text-muted">Open the print dialog as soon as the receipt animation ends</p></div>
            <Toggle on={prefs.autoPrint} onChange={(v) => update({ autoPrint: v })} />
          </div>
          <Button variant="outline" icon={<Printer className="size-4" />} disabled={!settings} onClick={() => settings && print([<Receipt key="t" session={SAMPLE} settings={settings} kind="ticket" copy="CUSTOMER COPY" />])}>
            Print test receipt
          </Button>
          <p className="text-xs text-faint">Tip: in the print dialog choose your thermal printer, set margins to “None” and turn off headers & footers. Chrome remembers it.</p>
        </div>
      </Card>
      <div className="space-y-6">
        <Card title="Alerts">
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-2xl border border-line p-4">
              <div className="flex items-center gap-3"><Volume2 className="size-5 text-brand" /><div><p className="font-semibold">Sounds</p><p className="text-sm text-muted">Start chime, time-up alarm, printer</p></div></div>
              <Toggle on={sound} onChange={(v) => { setSound(v); setSoundEnabled(v); if (v) playStart(); }} />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-line p-4">
              <div className="flex items-center gap-3"><Bell className="size-5 text-brand" /><div><p className="font-semibold">Notifications</p><p className="text-sm text-muted">Alert when a screen’s time is up, even in another tab</p></div></div>
              {notif === "granted" ? <span className="text-sm font-semibold text-ok">On</span> :
                notif === "unsupported" ? <span className="text-sm text-faint">Unsupported</span> :
                <Button size="sm" variant="subtle" onClick={async () => setNotif(await Notification.requestPermission())}>{notif === "denied" ? "Blocked" : "Enable"}</Button>}
            </div>
          </div>
        </Card>
        <Card title="Install the app" sub="Runs full-screen like a native app on desktop, Android and iPhone">
          {standalone ? <p className="flex items-center gap-2 text-sm text-ok"><Check className="size-4" />Installed — you’re running the app.</p> :
            canInstall ? <Button onClick={install}>Install Darkroom Arcade</Button> :
            ios ? <p className="text-sm text-muted">On iPhone/iPad: tap <b className="text-white">Share</b> → <b className="text-white">Add to Home Screen</b>.</p> :
            <p className="text-sm text-muted">Use your browser menu → <b className="text-white">Install app</b> / <b className="text-white">Add to Home screen</b>.</p>}
        </Card>
      </div>
    </div>
  );
}
