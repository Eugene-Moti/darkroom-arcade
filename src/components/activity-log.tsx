"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowRightLeft, Ban, Banknote, Crown, Flag, Pause, Play, RotateCcw, TimerReset, Undo2 } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { hoursLabel } from "@/lib/billing";
import { cn, duration, hm, money, ymd } from "@/lib/format";
import { PAYMENT_LABELS, type EventKind, type SessionEvent } from "@/lib/types";

const META: Record<EventKind, { icon: typeof Play; tone: string }> = {
  start: { icon: Play, tone: "text-brand" },
  pause: { icon: Pause, tone: "text-sky-300" },
  resume: { icon: RotateCcw, tone: "text-sky-300" },
  extend: { icon: TimerReset, tone: "text-brand" },
  move: { icon: ArrowRightLeft, tone: "text-muted" },
  member: { icon: Crown, tone: "text-brand" },
  payment: { icon: Banknote, tone: "text-ok" },
  refund: { icon: Undo2, tone: "text-warn" },
  end: { icon: Flag, tone: "text-white" },
  void: { icon: Ban, tone: "text-bad" },
};

function describe(e: SessionEvent, currency: string) {
  const via = e.method ? ` · ${PAYMENT_LABELS[e.method]}` : "";
  switch (e.kind) {
    case "start": return `Started${e.minutes ? `, ${hoursLabel(e.minutes)} booked` : ", open time"}`;
    case "pause": return "Timer paused";
    case "resume": return `Timer resumed${e.minutes ? ` after ${duration(e.minutes)}` : ""}`;
    case "extend": return `Added ${hoursLabel(e.minutes ?? 0)}`;
    case "move": return `Moved screen ${e.detail ?? ""}`;
    case "member": return `Member linked: ${e.detail ?? ""}`;
    case "payment": return `Paid ${money(e.amount, currency)}${via}${e.detail ? ` (${e.detail.toLowerCase()})` : ""}`;
    case "refund": return `Refunded ${money(Math.abs(Number(e.amount ?? 0)), currency)}${via}`;
    case "end": return `Checked out after ${duration(e.minutes)}`;
    case "void": return `Voided: ${e.detail ?? ""}`;
  }
}

/** Who did what on a receipt, newest last. Read-only: written by the server. */
export function ActivityLog({ sessionId, currency }: { sessionId: string; currency: string }) {
  const [rows, setRows] = useState<SessionEvent[] | null>(null);

  useEffect(() => {
    let off = false;
    getSupabase().from("session_events").select("*").eq("session_id", sessionId).order("id")
      .then(({ data }) => { if (!off) setRows((data as SessionEvent[]) ?? []); });
    return () => { off = true; };
  }, [sessionId]);

  if (!rows) return <div className="h-24 animate-pulse rounded-2xl bg-white/[0.03]" />;
  if (!rows.length) return <p className="text-sm text-faint">No activity recorded.</p>;

  const multiDay = new Set(rows.map((r) => ymd(r.created_at))).size > 1;
  return (
    <ol className="relative space-y-3 pl-1">
      <span className="absolute bottom-3 left-[17px] top-3 w-px bg-line" aria-hidden />
      {rows.map((e, i) => {
        const { icon: Icon, tone } = META[e.kind];
        return (
          <motion.li key={e.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }} className="relative flex items-start gap-3">
            <span className={cn("relative z-10 grid size-8 shrink-0 place-items-center rounded-full border border-line bg-panel", tone)}>
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 pt-1 text-sm">
              <p className="text-white">{describe(e, currency)}</p>
              <p className="text-xs text-faint">
                {multiDay ? `${ymd(e.created_at)} ` : ""}{hm(e.created_at)}{e.staff_name ? ` · ${e.staff_name}` : ""}
              </p>
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}
