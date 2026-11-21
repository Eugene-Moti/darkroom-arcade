"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Printer, Scissors } from "lucide-react";
import type { Member, MembershipSale, Session } from "@/lib/types";
import { playPrinter } from "@/lib/sound";
import { cn } from "@/lib/format";
import { useArcade } from "./arcade-provider";
import { Receipt, type ReceiptKind } from "./receipt";
import { MembershipReceipt } from "./membership-receipt";
import { readPrintPrefs, usePrint } from "./print";
import { Button } from "./ui";

const FEED_SECONDS = 2.6;

/**
 * Full-screen "thermal printer" that feeds the receipt out line by line,
 * then lets staff print the customer + shop copies and tear it off.
 */
export function ReceiptPrinter({
  session, kind, onClose,
}: { session: Session | null; kind: ReceiptKind; onClose: () => void }) {
  const { settings } = useArcade();
  return (
    <AnimatePresence>
      {session && settings && (
        <PrinterOverlay
          key={session.id + kind}
          render={(copy) => <Receipt session={session} settings={settings} kind={kind} copy={copy} />}
          doneTitle={kind === "final" ? "Payment complete" : session.extended_minutes > 0 ? "Ticket updated" : "Session started"}
          savedNote={`Saved as ${session.receipt_code} — reprint anytime from Receipts`}
          onClose={onClose}
        />
      )}
    </AnimatePresence>
  );
}

/** Animated print-out of a membership receipt (sign-up or renewal). */
export function MembershipPrinter({
  data, onClose,
}: { data: { member: Member; sale: MembershipSale | null } | null; onClose: () => void }) {
  const { settings } = useArcade();
  return (
    <AnimatePresence>
      {data && settings && (
        <PrinterOverlay
          key={data.member.id + (data.sale?.id ?? "card")}
          render={(copy) => <MembershipReceipt member={data.member} sale={data.sale} settings={settings} copy={copy} />}
          doneTitle={data.sale?.kind === "renew" ? "Membership renewed" : data.sale ? "Welcome, new member" : "Member card"}
          savedNote={`${data.member.member_no} · ${data.member.full_name}`}
          onClose={onClose}
        />
      )}
    </AnimatePresence>
  );
}

type Copy = "CUSTOMER COPY" | "SHOP COPY";

function PrinterOverlay({ render, doneTitle, savedNote, onClose }: {
  render: (copy: Copy) => React.ReactNode; doneTitle: string; savedNote: string; onClose: () => void;
}) {
  const print = usePrint();
  const paperRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const [phase, setPhase] = useState<"feeding" | "done" | "torn">("feeding");

  useLayoutEffect(() => {
    if (paperRef.current) setHeight(paperRef.current.offsetHeight);
  }, []);

  // Stepped keyframes = jerky line-feed motion of a real thermal printer
  const feed = useMemo(() => {
    const n = 22;
    const values: number[] = [];
    const times: number[] = [];
    for (let i = 0; i <= n; i++) {
      values.push((i / n) * height);
      times.push(i / n);
      if (i < n) {
        values.push((i / n) * height);
        times.push((i + 0.45) / n);
      }
    }
    return { values, times };
  }, [height]);

  useEffect(() => {
    if (!height) return;
    playPrinter(FEED_SECONDS);
    const t = setTimeout(() => {
      setPhase("done");
      if (readPrintPrefs().autoPrint) doPrint();
    }, FEED_SECONDS * 1000 + 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  function doPrint(only?: "customer") {
    const prefs = readPrintPrefs();
    const both = !only && prefs.copies === "both";
    print([
      <div key="c">{render("CUSTOMER COPY")}</div>,
      ...(both ? [<div key="s">{render("SHOP COPY")}</div>] : []),
    ]);
  }

  function tear() {
    setPhase("torn");
    setTimeout(onClose, 520);
  }

  return (
    <motion.div
      className="fixed inset-0 z-[60] overflow-y-auto bg-black/80 backdrop-blur-md print:hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="flex min-h-full flex-col items-center px-4 pb-10 pt-[max(2rem,env(safe-area-inset-top))]">
        <motion.p
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 font-display text-sm font-semibold uppercase tracking-[0.3em] text-muted"
        >
          {phase === "feeding" ? "Printing receipt…" : doneTitle}
        </motion.p>

        {/* Printer body */}
        <motion.div
          initial={{ y: -40, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 22 }}
          className="relative z-10 w-[min(360px,100%)]"
        >
          <motion.div
            animate={phase === "feeding" ? { x: [0, -0.6, 0.6, 0] } : { x: 0 }}
            transition={phase === "feeding" ? { repeat: Infinity, duration: 0.12 } : undefined}
            className="relative rounded-t-[28px] rounded-b-xl border border-white/10 bg-gradient-to-b from-[#2a2a30] via-[#1a1a1e] to-[#111114] px-5 pb-4 pt-4 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.08)]"
          >
            <div className="flex items-center justify-between">
              <span className="font-display text-[11px] font-bold uppercase tracking-[0.35em] text-white/40">Darkroom · TM-80</span>
              <span
                className={cn(
                  "size-2.5 rounded-full",
                  phase === "feeding" ? "animate-blink bg-brand shadow-[0_0_12px_3px_rgb(248_244_0/0.7)]" : "bg-emerald-400 shadow-[0_0_12px_3px_rgb(52_211_153/0.6)]",
                )}
              />
            </div>
            {/* paper slot */}
            <div className="relative mt-4 h-3 overflow-hidden rounded-full bg-black shadow-[inset_0_2px_6px_rgba(0,0,0,1)]">
              {phase === "feeding" && (
                <motion.div
                  className="absolute inset-y-0 w-16 bg-gradient-to-r from-transparent via-brand/60 to-transparent"
                  animate={{ x: ["-4rem", "22rem"] }}
                  transition={{ repeat: Infinity, duration: 0.5, ease: "linear" }}
                />
              )}
            </div>
          </motion.div>
        </motion.div>

        {/* Paper — anchored to the bottom so the header emerges first */}
        <motion.div
          className="relative -mt-2 flex w-[min(312px,calc(100%-48px))] flex-col justify-end overflow-hidden"
          initial={{ height: 0 }}
          animate={
            phase === "torn"
              ? { height, y: 80, rotate: -4, opacity: 0 }
              : height
                ? { height: feed.values }
                : { height: 0 }
          }
          transition={
            phase === "torn"
              ? { duration: 0.5, ease: [0.4, 0, 1, 1] }
              : { duration: FEED_SECONDS, times: feed.times, ease: "linear" }
          }
        >
          <div ref={paperRef} className="paper-tear-bottom shrink-0 shadow-2xl shadow-black/60">
            {render("CUSTOMER COPY")}
          </div>
          {/* top shading where the paper exits the slot */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-black/35 to-transparent" />
        </motion.div>

        <AnimatePresence>
          {phase === "done" && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-6 flex w-[min(360px,100%)] flex-col gap-2.5"
            >
              <Button size="lg" icon={<Printer className="size-5" />} onClick={() => doPrint()}>
                Print {readPrintPrefs().copies === "both" ? "customer + shop copy" : "receipt"}
              </Button>
              <div className="grid grid-cols-2 gap-2.5">
                <Button variant="outline" icon={<Printer className="size-4" />} onClick={() => doPrint("customer")}>
                  Customer only
                </Button>
                <Button variant="subtle" icon={<Scissors className="size-4" />} onClick={tear}>
                  Tear & close
                </Button>
              </div>
              <p className="mt-1 flex items-center justify-center gap-1.5 text-xs text-muted">
                <Check className="size-3.5 text-emerald-400" /> {savedNote}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
