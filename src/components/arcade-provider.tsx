"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/client";
import type {
  Game, Member, MemberOffer, MembershipPlan, MembershipSale, PaymentMethod, Profile, Screen, Session, Settings,
} from "@/lib/types";
import { dayRange, errorMessage, ymd } from "@/lib/format";
import { timerState } from "@/lib/billing";
import { playAlarm, playBlip } from "@/lib/sound";
import { useToast } from "./toast";

interface StartInput {
  screenId: string;
  game: string;
  teamCode?: string;
  customerName?: string;
  customerPhone?: string;
  players?: number;
  plannedMinutes?: number | null;
  notes?: string;
  /** Set to collect payment for the booked time right away */
  paymentMethod?: PaymentMethod | null;
  /** Member session: the server applies their discount */
  memberId?: string | null;
}

export interface MemberInput {
  name: string;
  phone?: string;
  planId?: string | null;
  payment?: PaymentMethod | null;
  notes?: string;
}

/** Result of a sign-up or renewal: the member and the sale to print (if any). */
export interface MemberResult {
  member: Member;
  sale: MembershipSale | null;
}

interface ArcadeCtx {
  ready: boolean;
  error: string | null;
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
  settings: Settings | null;
  screens: Screen[];
  games: Game[];
  plans: MembershipPlan[];
  offers: MemberOffer[];
  /** Every member, sorted by name (kept live via realtime) */
  members: Member[];
  /** Live (active/paused) sessions keyed by screen id */
  liveByScreen: Map<string, Session>;
  /** Every session started today (local day), newest first */
  today: Session[];
  /** Server-corrected epoch ms. Use `useNow()` in components for ticking. */
  serverNow: () => number;
  reload: () => Promise<void>;
  setSettings: (s: Settings) => void;
  setScreens: (s: Screen[]) => void;
  setGames: (g: Game[]) => void;
  setPlans: (p: MembershipPlan[]) => void;
  setOffers: (o: MemberOffer[]) => void;
  createMember: (input: MemberInput) => Promise<MemberResult>;
  renewMember: (memberId: string, planId: string, payment: PaymentMethod | null) => Promise<MemberResult>;
  updateMember: (id: string, patch: Pick<Member, "full_name" | "phone" | "notes">) => Promise<Member>;
  adminUpdateMember: (id: string, expiresAt: string | null, isActive: boolean) => Promise<Member>;
  attachMember: (sessionId: string, memberId: string) => Promise<Session>;
  start: (input: StartInput) => Promise<Session>;
  end: (id: string, payment: PaymentMethod, discount: number) => Promise<Session>;
  pause: (id: string) => Promise<Session>;
  resume: (id: string) => Promise<Session>;
  /** Add time; pass a payment method to collect payment for it now */
  extend: (id: string, minutes: number, payment?: PaymentMethod | null) => Promise<Session>;
  switchScreen: (id: string, screenId: string) => Promise<Session>;
  cancel: (id: string, reason: string) => Promise<Session>;
  findByReceipt: (code: string) => Promise<Session | null>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<ArcadeCtx | null>(null);

/** Must match public.schema_version() in supabase/schema.sql */
const REQUIRED_SCHEMA = 3;
export const UPDATE_NEEDED =
  "Database update needed: this version of the app needs the latest supabase/schema.sql. Re-running it keeps all your receipts, members and settings.";

function friendlyMemberError(msg: string) {
  if (msg.includes("members_phone_key")) return "Another member already has this phone number";
  return msg;
}

/** Like useArcade, but returns null outside the provider (e.g. print previews). */
export function useArcadeOptional() {
  return useContext(Ctx);
}

export function useArcade() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useArcade must be used inside <ArcadeProvider>");
  return c;
}

const NowCtx = createContext<number>(0);
/** Ticks once per second with server-corrected time. */
export function useNow() {
  return useContext(NowCtx);
}

export function ArcadeProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabase();
  const toast = useToast();
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [screens, setScreens] = useState<Screen[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [offers, setOffers] = useState<MemberOffer[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [sessions, setSessions] = useState<Map<string, Session>>(new Map());
  // Clock values start empty and are filled on the first client tick, so nothing
  // time-dependent is baked into the prerendered shell.
  const [now, setNow] = useState(0);
  const offset = useRef(0);
  const [day, setDay] = useState("");
  const lastDay = useRef("");

  const serverNow = useCallback(() => Date.now() + offset.current, []);

  const upsert = useCallback((rows: Session[]) => {
    setSessions((prev) => {
      const next = new Map(prev);
      rows.forEach((r) => next.set(r.id, r));
      return next;
    });
  }, []);

  const upsertMember = useCallback((m: Member) => {
    setMembers((prev) => {
      const next = prev.filter((x) => x.id !== m.id);
      next.push(m);
      return next.sort((a, b) => a.full_name.localeCompare(b.full_name));
    });
  }, []);

  const loadMembership = useCallback(async () => {
    const [pl, of, mb] = await Promise.all([
      supabase.from("membership_plans").select("*").order("sort_order").order("price"),
      supabase.from("member_offers").select("*").order("sort_order").order("created_at"),
      supabase.from("members").select("*").order("full_name").limit(5000),
    ]);
    if (!pl.error) setPlans((pl.data as MembershipPlan[]) ?? []);
    if (!of.error) setOffers((of.data as MemberOffer[]) ?? []);
    if (!mb.error) setMembers((mb.data as Member[]) ?? []);
  }, [supabase]);

  const reload = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    setUser(auth.user);
    if (!auth.user) {
      setReady(true);
      return;
    }
    const t0 = Date.now();
    const [prof, st, sc, gm, live, todays, clock, version] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", auth.user.id).maybeSingle(),
      supabase.from("settings").select("*").eq("id", 1).maybeSingle(),
      supabase.from("screens").select("*").order("sort_order").order("code"),
      supabase.from("games").select("*").order("sort_order").order("title"),
      supabase.from("sessions").select("*").in("status", ["active", "paused"]),
      (() => {
        const { from, to } = dayRange(ymd(new Date()));
        return supabase.from("sessions").select("*").gte("started_at", from).lt("started_at", to);
      })(),
      supabase.rpc("server_now"),
      supabase.rpc("schema_version"),
    ]);
    const firstErr = [prof, st, sc, gm, live, todays].find((r) => r.error)?.error;
    if (firstErr) {
      setError(
        firstErr.code === "PGRST205" || firstErr.code === "42P01"
          ? "Database not set up yet. Run supabase/schema.sql in the Supabase SQL editor."
          : firstErr.message,
      );
    } else if (version.error || Number(version.data) < REQUIRED_SCHEMA) {
      setError(UPDATE_NEEDED);
    } else setError(null);
    if (clock.data) {
      const rtt = Date.now() - t0;
      offset.current = Date.parse(clock.data as string) + rtt / 2 - Date.now();
    }
    setProfile((prof.data as Profile) ?? null);
    setSettings((st.data as Settings) ?? null);
    setScreens((sc.data as Screen[]) ?? []);
    setGames((gm.data as Game[]) ?? []);
    const m = new Map<string, Session>();
    [...((todays.data as Session[]) ?? []), ...((live.data as Session[]) ?? [])].forEach((s) => m.set(s.id, s));
    setSessions(m);
    if (!firstErr) await loadMembership();
    setReady(true);
  }, [supabase, loadMembership]);

  // initial load + auth changes
  useEffect(() => {
    // reload() only sets state after its first await, so this cannot cascade
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
    const { data: sub } = supabase.auth.onAuthStateChange((evt) => {
      if (evt === "SIGNED_OUT") router.replace("/login");
    });
    return () => sub.subscription.unsubscribe();
  }, [reload, supabase, router]);

  // realtime sync across devices
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("arcade-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, (p) => {
        if (p.new && "id" in p.new) upsert([p.new as Session]);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "screens" }, () => {
        void supabase.from("screens").select("*").order("sort_order").order("code")
          .then(({ data }) => data && setScreens(data as Screen[]));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "settings" }, (p) => {
        setSettings(p.new as Settings);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "members" }, (p) => {
        if (p.new && "id" in p.new) upsertMember(p.new as Member);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "membership_plans" }, () => void loadMembership())
      .on("postgres_changes", { event: "*", schema: "public", table: "member_offers" }, () => void loadMembership())
      .subscribe();
    // refetch when returning to the tab (sockets can sleep on mobile)
    const onVis = () => document.visibilityState === "visible" && void reload();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      void supabase.removeChannel(ch);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [user, supabase, upsert, reload, upsertMember, loadMembership]);

  // 1s heartbeat; roll over to a new day at midnight
  useEffect(() => {
    const tick = () => {
      setNow(Date.now() + offset.current);
      const d = ymd(new Date());
      if (d !== lastDay.current) {
        const rolledOver = lastDay.current !== "";
        lastDay.current = d;
        setDay(d);
        if (rolledOver) void reload();
      }
    };
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [reload]);

  const liveByScreen = useMemo(() => {
    const m = new Map<string, Session>();
    sessions.forEach((s) => {
      if ((s.status === "active" || s.status === "paused") && s.screen_id) m.set(s.screen_id, s);
    });
    return m;
  }, [sessions]);

  const today = useMemo(() => {
    if (!day) return [];
    const { from, to } = dayRange(day);
    const f = Date.parse(from), t = Date.parse(to);
    return [...sessions.values()]
      .filter((s) => { const x = Date.parse(s.started_at); return x >= f && x < t; })
      .sort((a, b) => b.started_at.localeCompare(a.started_at));
  }, [sessions, day]);

  // time-up / warning alerts (silent on first pass so reloads don't blare)
  const fired = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!settings) return;
    const first = fired.current === null;
    if (first) fired.current = new Set();
    const set = fired.current!;
    liveByScreen.forEach((s) => {
      const st = timerState(s, now, settings);
      const key = `${s.id}:${s.planned_minutes}:${st}`;
      if ((st === "warning" || st === "overtime") && !set.has(key)) {
        set.add(key);
        if (first) return;
        if (st === "warning") {
          playBlip();
          toast("warning", `Screen ${s.screen_code}: ${settings.warn_before_minutes} min left`, `${s.game_title} · ${s.receipt_code}`);
        } else {
          playAlarm();
          toast("warning", `Screen ${s.screen_code}: time's up!`, `${s.game_title} · ${s.receipt_code} · tap +1h on the card to add time`);
          try {
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification(`Screen ${s.screen_code} — time's up`, {
                body: `${s.game_title} · ${s.receipt_code}`,
                icon: "/icons/icon-192.png",
                tag: key,
              });
            }
          } catch {}
        }
      }
    });
  }, [now, liveByScreen, settings, toast]);

  const call = useCallback(
    async (fn: string, args: Record<string, unknown>) => {
      const { data, error } = await supabase.rpc(fn, args);
      if (error) throw new Error(error.message);
      const row = data as Session;
      upsert([row]);
      return row;
    },
    [supabase, upsert],
  );

  const value: ArcadeCtx = {
    ready, error, user, profile,
    isAdmin: profile?.role === "admin",
    settings, screens, games, plans, offers, members, liveByScreen, today, serverNow, reload,
    setSettings, setScreens, setGames, setPlans, setOffers,
    start: (i) =>
      call("start_session", {
        p_screen_id: i.screenId,
        p_game_title: i.game,
        p_team_code: i.teamCode ?? "0",
        p_customer_name: i.customerName ?? null,
        p_customer_phone: i.customerPhone ?? null,
        p_players: i.players ?? 1,
        p_planned_minutes: i.plannedMinutes ?? null,
        p_notes: i.notes ?? null,
        p_payment_method: i.paymentMethod ?? null,
        p_member_id: i.memberId ?? null,
      }),
    end: (id, payment, discount) => call("end_session", { p_id: id, p_payment_method: payment, p_discount: discount }),
    pause: (id) => call("pause_session", { p_id: id }),
    resume: (id) => call("resume_session", { p_id: id }),
    extend: (id, minutes, payment) => call("extend_session", { p_id: id, p_minutes: minutes, p_payment_method: payment ?? null }),
    switchScreen: (id, screenId) => call("switch_screen", { p_id: id, p_screen_id: screenId }),
    cancel: (id, reason) => call("cancel_session", { p_id: id, p_reason: reason }),
    attachMember: (id, memberId) => call("attach_member", { p_id: id, p_member_id: memberId }),
    createMember: async (i) => {
      const { data, error } = await supabase.rpc("create_member", {
        p_full_name: i.name, p_phone: i.phone || null, p_plan_id: i.planId ?? null,
        p_payment_method: i.payment ?? null, p_notes: i.notes || null,
      });
      if (error) throw new Error(friendlyMemberError(error.message));
      const r = data as MemberResult;
      upsertMember(r.member);
      return r;
    },
    renewMember: async (memberId, planId, payment) => {
      const { data, error } = await supabase.rpc("renew_member", { p_member_id: memberId, p_plan_id: planId, p_payment_method: payment });
      if (error) throw new Error(friendlyMemberError(error.message));
      const r = data as MemberResult;
      upsertMember(r.member);
      return r;
    },
    updateMember: async (id, patch) => {
      const { data, error } = await supabase.from("members").update(patch).eq("id", id).select().single();
      if (error) throw new Error(friendlyMemberError(error.message));
      upsertMember(data as Member);
      return data as Member;
    },
    adminUpdateMember: async (id, expiresAt, isActive) => {
      const { data, error } = await supabase.rpc("admin_update_member", { p_id: id, p_expires_at: expiresAt, p_is_active: isActive });
      if (error) throw new Error(error.message);
      upsertMember(data as Member);
      return data as Member;
    },
    findByReceipt: async (code) => {
      const clean = code.trim().toUpperCase();
      const digits = clean.replace(/\D/g, "");
      const q = supabase.from("sessions").select("*").limit(1);
      const { data, error } = digits && digits === clean
        ? await q.eq("receipt_no", Number(digits))
        : await q.eq("receipt_code", clean);
      if (error) throw new Error(errorMessage(error));
      const row = (data?.[0] as Session) ?? null;
      if (row) upsert([row]);
      return row;
    },
    signOut: async () => {
      await supabase.auth.signOut();
      router.replace("/login");
      router.refresh();
    },
  };

  return (
    <Ctx.Provider value={value}>
      <NowCtx.Provider value={now}>{children}</NowCtx.Provider>
    </Ctx.Provider>
  );
}

