"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  BarChart3, Clock3, Crown, Database, LayoutGrid, LogOut, ReceiptText, Settings as Cog, ShieldAlert, Volume2, VolumeX,
} from "lucide-react";
import { cn, hms } from "@/lib/format";
import { setSoundEnabled, soundEnabled } from "@/lib/sound";
import { useArcade, useNow } from "./arcade-provider";
import { Emblem, Wordmark } from "./emblem";
import { InstallButton } from "./install-button";
import { Button } from "./ui";

const NAV = [
  { href: "/", label: "Floor", icon: LayoutGrid },
  { href: "/sessions", label: "Receipts", icon: ReceiptText },
  { href: "/members", label: "Members", icon: Crown },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Cog },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { ready, error, profile, user, signOut, liveByScreen } = useArcade();
  const path = usePathname();
  // Brand intro plays once per browser session (min 1.4s), afterwards only while loading.
  // Hydration-safe: the splash shows on the first render regardless, because `ready` starts false.
  const [introDone, setIntroDone] = useState(() => {
    try { return typeof window !== "undefined" && sessionStorage.getItem("dra:intro") === "1"; } catch { return false; }
  });
  useEffect(() => {
    if (introDone) return;
    const t = setTimeout(() => {
      setIntroDone(true);
      try { sessionStorage.setItem("dra:intro", "1"); } catch {}
    }, 1400);
    return () => clearTimeout(t);
  }, [introDone]);

  const showSplash = !ready || !introDone;

  return (
    <>
      <AnimatePresence>{showSplash && <Splash key="splash" />}</AnimatePresence>
      {!showSplash && (
        error ? <SetupNeeded message={error} /> :
        !user ? null :
        profile?.role === "pending" || !profile ? <PendingApproval email={user.email} onSignOut={signOut} /> : (
          <div className="arcade-bg min-h-dvh">
            <Sidebar path={path} live={liveByScreen.size} />
            <div className="lg:pl-64">
              <TopBar />
              <main className="mx-auto max-w-7xl px-4 pb-28 pt-4 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">
                <motion.div key={path} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                  {children}
                </motion.div>
              </main>
            </div>
            <BottomNav path={path} live={liveByScreen.size} />
          </div>
        )
      )}
    </>
  );
}

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path.startsWith(href);
}

function Sidebar({ path, live }: { path: string; live: number }) {
  const { profile, signOut } = useArcade();
  const [sound, setSound] = useState(soundEnabled);
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-panel/70 backdrop-blur-xl lg:flex">
      <Link href="/" className="flex items-center gap-3 px-6 pb-6 pt-7">
        <Emblem size={42} glow />
        <Wordmark className="text-lg" />
      </Link>
      <nav className="flex-1 space-y-1 px-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const on = isActive(path, href);
          return (
            <Link
              key={href}
              href={href}
              className={cn("relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition", on ? "text-black" : "text-muted hover:bg-white/[0.04] hover:text-white")}
            >
              {on && <motion.span layoutId="nav-on" className="absolute inset-0 rounded-xl bg-brand shadow-[0_0_24px_-6px_rgb(248_244_0/0.8)]" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
              <Icon className="relative size-[18px]" />
              <span className="relative">{label}</span>
              {href === "/" && live > 0 && (
                <span className={cn("relative ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold", on ? "bg-black/15" : "bg-brand/15 text-brand")}>{live} live</span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="space-y-3 border-t border-line p-4">
        <InstallButton className="w-full justify-center" />
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-full bg-white/[0.06] font-display text-sm font-bold uppercase text-brand">
            {(profile?.full_name ?? profile?.email ?? "?").slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{profile?.full_name ?? profile?.email}</p>
            <p className="text-xs capitalize text-faint">{profile?.role}</p>
          </div>
          <button
            onClick={() => { setSoundEnabled(!sound); setSound(!sound); }}
            className="rounded-lg p-2 text-muted hover:bg-white/5 hover:text-white"
            aria-label={sound ? "Mute sounds" : "Unmute sounds"}
            title={sound ? "Mute sounds" : "Unmute sounds"}
          >
            {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </button>
          <button onClick={signOut} className="rounded-lg p-2 text-muted hover:bg-white/5 hover:text-white" aria-label="Sign out" title="Sign out">
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function TopBar() {
  const now = useNow();
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-ink/80 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl lg:hidden">
      <Link href="/" className="flex items-center gap-2.5">
        <Emblem size={34} glow />
        <Wordmark className="text-base" />
      </Link>
      <div className="ml-auto flex items-center gap-2">
        <InstallButton className="px-2.5 py-1.5 text-xs" />
        <span className="flex items-center gap-1.5 rounded-lg bg-white/[0.04] px-2.5 py-1.5 font-mono text-xs font-bold text-muted tabular-nums">
          <Clock3 className="size-3.5 text-brand" />
          {now ? hms(new Date(now)) : "--:--:--"}
        </span>
      </div>
    </header>
  );
}

function BottomNav({ path, live }: { path: string; live: number }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-panel/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
      <div className="grid grid-cols-5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const on = isActive(path, href);
          return (
            <Link key={href} href={href} className={cn("relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium", on ? "text-brand" : "text-muted")}>
              {on && <motion.span layoutId="tab-on" className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-brand shadow-[0_0_12px_rgb(248_244_0)]" />}
              <span className="relative">
                <Icon className="size-[22px]" />
                {href === "/" && live > 0 && (
                  <span className="absolute -right-2.5 -top-1.5 grid min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-black">{live}</span>
                )}
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function Splash() {
  return (
    <motion.div
      className="fixed inset-0 z-[90] grid place-items-center bg-ink"
      exit={{ opacity: 0, scale: 1.04, filter: "blur(6px)" }}
      transition={{ duration: 0.45 }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 animate-scan bg-gradient-to-b from-transparent via-brand/[0.06] to-transparent" />
      <div className="flex flex-col items-center">
        <div className="relative">
          <motion.div
            className="absolute -inset-6 rounded-full bg-brand/20 blur-2xl"
            animate={{ opacity: [0.3, 0.8, 0.3] }}
            transition={{ repeat: Infinity, duration: 2 }}
          />
          <Emblem size={128} animate />
        </div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }} className="mt-6 text-center">
          <Wordmark className="text-2xl" />
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.4em] text-faint">Press start</p>
        </motion.div>
        <motion.div className="mt-6 h-1 w-40 overflow-hidden rounded-full bg-white/[0.06]">
          <motion.div
            className="h-full rounded-full bg-brand"
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: 1.3, ease: [0.65, 0, 0.35, 1] }}
          />
        </motion.div>
      </div>
    </motion.div>
  );
}

function CenterCard({ children }: { children: ReactNode }) {
  return (
    <div className="arcade-bg grid min-h-dvh place-items-center p-4">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg rounded-3xl border border-line bg-panel/90 p-6 text-center shadow-2xl sm:p-8">
        {children}
      </motion.div>
    </div>
  );
}

function SetupNeeded({ message }: { message: string }) {
  return (
    <CenterCard>
      <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-brand/10 text-brand"><Database className="size-7" /></div>
      <h1 className="font-display text-2xl font-bold">{message.startsWith("Database update") ? "Database update needed" : "Almost ready"}</h1>
      <p className="mt-2 text-sm text-muted">{message}</p>
      <ol className="mt-5 space-y-2 rounded-2xl border border-line bg-white/[0.02] p-4 text-left text-sm text-muted">
        <li>1. Open your Supabase project → <b className="text-white">SQL Editor</b> → New query.</li>
        <li>2. Paste the <b className="text-white">whole</b> of <code className="text-brand">supabase/schema.sql</code> (the latest version) and click <b className="text-white">Run</b>.</li>
        <li>3. Come back here and reload.</li>
      </ol>
      <Button className="mt-5" onClick={() => location.reload()}>Reload</Button>
    </CenterCard>
  );
}

function PendingApproval({ email, onSignOut }: { email?: string | null; onSignOut: () => void }) {
  return (
    <CenterCard>
      <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-brand/10 text-brand"><ShieldAlert className="size-7" /></div>
      <h1 className="font-display text-2xl font-bold">Waiting for approval</h1>
      <p className="mt-2 text-sm text-muted">
        <b className="text-white">{email}</b> is registered. An admin needs to approve you in <b className="text-white">Settings → Team</b> before you can run sessions.
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <Button variant="outline" onClick={() => location.reload()}>Check again</Button>
        <Button variant="ghost" onClick={onSignOut} icon={<LogOut className="size-4" />}>Sign out</Button>
      </div>
    </CenterCard>
  );
}
