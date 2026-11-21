"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Banknote, Clock, Gamepad2, MonitorPlay, ScanBarcode, Tv } from "lucide-react";
import { useArcade, useNow } from "@/components/arcade-provider";
import { ScreenCard } from "@/components/screen-card";
import { CheckoutSheet, ExtendSheet, ManageSheet, StartSessionSheet } from "@/components/session-sheets";
import { ReceiptPrinter } from "@/components/receipt-printer";
import type { ReceiptKind } from "@/components/receipt";
import { useToast } from "@/components/toast";
import { AnimatedNumber, Empty, Input, Stat, StatusPill } from "@/components/ui";
import { elapsedSeconds } from "@/lib/billing";
import { duration, errorMessage, hm, money, prettyDate } from "@/lib/format";
import type { Screen, Session } from "@/lib/types";

export default function FloorPage() {
  const { screens, liveByScreen, today, settings, profile, findByReceipt } = useArcade();
  const now = useNow();
  const toast = useToast();

  const [startFor, setStartFor] = useState<Screen | null>(null);
  const [checkout, setCheckout] = useState<Session | null>(null);
  const [manage, setManage] = useState<Session | null>(null);
  const [extendFor, setExtendFor] = useState<Session | null>(null);
  const [printing, setPrinting] = useState<{ s: Session; kind: ReceiptKind } | null>(null);
  const [scan, setScan] = useState("");
  const scanRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => {
    const done = today.filter((s) => s.status === "completed");
    const revenue = done.reduce((a, s) => a + Number(s.amount ?? 0), 0);
    const minutes = today
      .filter((s) => s.status !== "cancelled")
      .reduce((a, s) => a + (s.played_minutes ?? Math.floor(elapsedSeconds(s, now) / 60)), 0);
    return { revenue, count: today.filter((s) => s.status !== "cancelled").length, minutes };
  }, [today, now]);

  // Always show the latest copy of a live session (realtime updates, pauses…)
  const fresh = (s: Session | null) => (s ? [...liveByScreen.values()].find((x) => x.id === s.id) ?? s : null);

  const activeScreens = screens.filter((s) => s.is_active).length;
  const hour = new Date(now).getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  async function onScan(e: React.FormEvent) {
    e.preventDefault();
    const code = scan.trim();
    if (!code) return;
    try {
      const s = await findByReceipt(code);
      setScan("");
      if (!s) return toast("error", "Receipt not found", code.toUpperCase());
      if (s.status === "active" || s.status === "paused") setCheckout(s);
      else {
        toast("info", `${s.receipt_code} is already ${s.status === "completed" ? "paid" : "void"}`, "Showing the final receipt");
        setPrinting({ s, kind: "final" });
      }
    } catch (err) {
      toast("error", "Lookup failed", errorMessage(err));
    }
  }

  return (
    <div className="space-y-6 lg:space-y-8">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-muted">{prettyDate(new Date(now))}</p>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {greet}, <span className="text-brand">{profile?.full_name?.split(" ")[0] ?? "team"}</span>
          </h1>
        </div>
        <form onSubmit={onScan} className="relative w-full lg:w-96">
          <ScanBarcode className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-brand" />
          <Input
            ref={scanRef}
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            placeholder="Scan or type receipt ID to check out"
            className="h-12 pl-11 pr-12 font-mono uppercase placeholder:font-sans placeholder:normal-case"
            autoCapitalize="characters"
            autoComplete="off"
          />
          <button type="submit" className="absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg bg-brand text-black" aria-label="Find receipt">
            <ArrowRight className="size-4" />
          </button>
        </form>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Stat label="Live now" icon={<MonitorPlay className="size-4" />} value={<><AnimatedNumber value={liveByScreen.size} /><span className="text-lg text-faint">/{activeScreens}</span></>} sub="screens in play" accent />
        <Stat label="Revenue today" icon={<Banknote className="size-4" />} value={<AnimatedNumber value={stats.revenue} format={(n) => money(Math.round(n), settings?.currency)} />} sub="paid sessions" />
        <Stat label="Sessions" icon={<Gamepad2 className="size-4" />} value={<AnimatedNumber value={stats.count} />} sub="started today" />
        <Stat label="Play time" icon={<Clock className="size-4" />} value={duration(stats.minutes)} sub="across all screens" />
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">Screens</h2>
          <div className="flex items-center gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-emerald-400" />Free</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-brand" />Playing</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-warn" />Ending</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-bad" />Over</span>
          </div>
        </div>
        {screens.length === 0 ? (
          <Empty icon={<Tv className="size-7" />} title="No screens yet" body="Add your screens (A, B, C…) in Settings to start tracking sessions." action={<Link className="text-brand underline" href="/settings">Open settings</Link>} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {screens.map((sc, i) => (
              <ScreenCard
                key={sc.id}
                index={i}
                screen={sc}
                session={liveByScreen.get(sc.id)}
                onStart={() => setStartFor(sc)}
                onEnd={() => setCheckout(liveByScreen.get(sc.id) ?? null)}
                onMore={() => setManage(liveByScreen.get(sc.id) ?? null)}
                onExtend={() => setExtendFor(liveByScreen.get(sc.id) ?? null)}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">Today&apos;s activity</h2>
          <Link href="/sessions" className="flex items-center gap-1 text-sm text-muted hover:text-brand">All receipts <ArrowRight className="size-4" /></Link>
        </div>
        {today.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">No sessions yet today. The first one is on the house… just kidding.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel/70">
            <AnimatePresence initial={false}>
              {today.slice(0, 8).map((s) => (
                <motion.li
                  key={s.id}
                  layout
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/[0.05] font-display font-bold text-brand">{s.screen_code}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{s.game_title} <span className="font-mono text-xs font-normal text-faint">· {s.receipt_code}</span></p>
                    <p className="text-xs text-muted">{hm(s.started_at)}{s.ended_at ? ` – ${hm(s.ended_at)}` : ""} · Team {s.team_code}</p>
                  </div>
                  <div className="text-right">
                    <StatusPill status={s.status} />
                    {s.status === "completed" && <p className="mt-0.5 text-sm font-semibold tabular-nums">{money(s.amount, settings?.currency)}</p>}
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>

      <StartSessionSheet
        screen={startFor}
        onClose={() => setStartFor(null)}
        onStarted={(s) => {
          setStartFor(null);
          setPrinting({ s, kind: "ticket" });
        }}
      />
      <CheckoutSheet
        session={fresh(checkout)}
        onClose={() => setCheckout(null)}
        onPaid={(s) => {
          setCheckout(null);
          setPrinting({ s, kind: "final" });
        }}
      />
      <ManageSheet
        session={fresh(manage)}
        onClose={() => setManage(null)}
        onReprint={(s) => {
          setManage(null);
          setPrinting({ s, kind: "ticket" });
        }}
        onExtend={(s) => {
          setManage(null);
          setExtendFor(s);
        }}
      />
      <ExtendSheet
        session={fresh(extendFor)}
        onClose={() => setExtendFor(null)}
        onExtended={(s, print) => {
          setExtendFor(null);
          if (print) setPrinting({ s, kind: "ticket" });
        }}
      />
      <ReceiptPrinter session={printing?.s ?? null} kind={printing?.kind ?? "ticket"} onClose={() => setPrinting(null)} />
    </div>
  );
}
