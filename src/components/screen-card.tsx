"use client";

import { motion } from "motion/react";
import { CheckCircle2, Crown, Gamepad2, MoreHorizontal, Pause, Play, Receipt as ReceiptIcon, Users } from "lucide-react";
import type { Screen, Session } from "@/lib/types";
import { elapsedSeconds, endsAt, extendOptions, hoursLabel, liveBill, timerState, type TimerState } from "@/lib/billing";
import { clock, cn, duration, errorMessage, hm, money } from "@/lib/format";
import { useArcade, useNow } from "./arcade-provider";
import { Button } from "./ui";
import { useToast } from "./toast";

const TONE: Record<TimerState, { color: string; label: string; text: string }> = {
  running: { color: "#f8f400", label: "Playing", text: "text-brand" },
  open: { color: "#f8f400", label: "Open time", text: "text-brand" },
  warning: { color: "#fbbf24", label: "Ending soon", text: "text-warn" },
  overtime: { color: "#f43f5e", label: "Time's up", text: "text-bad" },
  paused: { color: "#38bdf8", label: "Paused", text: "text-sky-300" },
};

function Ring({ progress, color, children }: { progress: number; color: string; children: React.ReactNode }) {
  const r = 52, c = 2 * Math.PI * r;
  return (
    <div className="relative size-[132px] shrink-0">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgb(255 255 255 / 0.06)" strokeWidth="7" />
        <motion.circle
          cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c * (1 - Math.min(1, Math.max(0, progress))) }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          style={{ filter: `drop-shadow(0 0 6px ${color}88)` }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

export function ScreenCard({
  screen, session, onStart, onEnd, onMore, onExtend, index,
}: {
  screen: Screen;
  session?: Session;
  onStart: () => void;
  onEnd: () => void;
  onMore: () => void;
  onExtend: () => void;
  index: number;
}) {
  const { settings, resume, pause } = useArcade();
  const now = useNow();
  const toast = useToast();
  const run = (fn: () => Promise<unknown>) => fn().catch((e) => toast("error", "Couldn't update session", errorMessage(e)));

  const base = "relative flex min-h-[290px] flex-col overflow-hidden rounded-3xl border p-5";

  if (!screen.is_active) {
    return (
      <div className={cn(base, "border-line bg-panel/40 opacity-60")}>
        <ScreenLetter code={screen.code} dim />
        <div className="mt-auto">
          <p className="font-display text-lg font-semibold text-muted">Out of service</p>
          <p className="text-sm text-faint">{screen.name ?? "Enable it in Settings"}</p>
        </div>
      </div>
    );
  }

  if (!session || !settings) {
    const rate = screen.hourly_rate ?? settings?.default_hourly_rate ?? 0;
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.04 }}
        className={cn(base, "group border-line bg-panel/70 transition-colors hover:border-brand/30")}
      >
        <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-brand/0 blur-3xl transition-colors duration-500 group-hover:bg-brand/10" />
        <div className="flex items-start justify-between">
          <ScreenLetter code={screen.code} />
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
            <span className="size-1.5 rounded-full bg-emerald-400" /> Free
          </span>
        </div>
        <div className="mt-auto space-y-4">
          <div>
            <p className="text-sm text-muted">{screen.name ?? `Screen ${screen.code}`} · {screen.console}</p>
            <p className="font-display text-lg font-semibold text-white">{money(rate, settings?.currency)}<span className="text-sm font-normal text-muted"> / hour</span></p>
          </div>
          <Button className="w-full" icon={<Play className="size-4 fill-current" />} onClick={onStart}>
            Start session
          </Button>
        </div>
      </motion.div>
    );
  }

  const state = timerState(session, now, settings);
  const tone = TONE[state];
  const played = elapsedSeconds(session, now);
  const planned = session.planned_minutes ? session.planned_minutes * 60 : null;
  const remaining = planned ? planned - played : null;
  const bill = liveBill(session, now, settings);
  const end = endsAt(session, now);
  const step = extendOptions(settings)[0];
  const paidUp = bill.prepaid > 0 && bill.balance <= 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        base,
        "live-border border-transparent bg-gradient-to-b from-panel-2 to-panel",
        state === "overtime" && "shadow-[0_0_40px_-8px_rgb(244_63_94/0.6)]",
      )}
      style={{ ["--live-color" as string]: tone.color }}
    >
      {state === "overtime" && (
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-3xl bg-bad/10"
          animate={{ opacity: [0, 1, 0] }}
          transition={{ repeat: Infinity, duration: 1.2 }}
        />
      )}
      <div className="relative flex items-start justify-between gap-2">
        <ScreenLetter code={screen.code} live color={tone.color} />
        <div className="flex items-center gap-1">
          <span className={cn("rounded-full border border-current/20 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide", tone.text)}>
            {tone.label}
          </span>
          <button onClick={onMore} className="rounded-xl p-2 text-muted hover:bg-white/5 hover:text-white" aria-label="More actions">
            <MoreHorizontal className="size-5" />
          </button>
        </div>
      </div>

      <div className="relative mt-3 flex items-center gap-4">
        <Ring progress={planned ? played / planned : (played % 3600) / 3600} color={tone.color}>
          <div>
            <p className={cn("font-mono font-bold tabular-nums", remaining != null && remaining < 0 ? "text-[16px]" : "text-[19px]", tone.text)}>
              {remaining != null ? (remaining >= 0 ? clock(remaining) : "+" + clock(-remaining)) : clock(played)}
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-faint">
              {remaining != null ? (remaining >= 0 ? "left" : "over") : "elapsed"}
            </p>
          </div>
        </Ring>
        <div className="min-w-0 flex-1 space-y-1.5 text-sm">
          <p className="flex items-center gap-1.5 truncate font-semibold text-white">
            <Gamepad2 className="size-4 shrink-0 text-brand" /> <span className="truncate">{session.game_title}</span>
          </p>
          <p className="text-muted">
            In {hm(session.started_at)}
            {end ? <> · Ends <b className={cn("font-semibold", tone.text)}>{hm(new Date(end))}</b></> : " · open time"}
          </p>
          {session.planned_minutes ? (
            <p className="text-xs text-faint">
              {duration(session.planned_minutes)} booked{session.extended_minutes > 0 && <span className="text-brand"> · +{duration(session.extended_minutes)} added</span>}
            </p>
          ) : null}
          {session.member_id ? (
            <p className="flex items-center gap-1.5 truncate text-brand">
              <Crown className="size-3.5 shrink-0" /> <span className="truncate">{session.member_name}</span>
              {session.member_discount_pct > 0 && <span className="shrink-0 rounded-md bg-brand/15 px-1.5 text-[11px] font-bold">−{session.member_discount_pct}%</span>}
            </p>
          ) : (
            <p className="flex items-center gap-1.5 truncate text-muted">
              <Users className="size-3.5 shrink-0" /> <span className="truncate">{session.customer_name ?? "Walk-in"}{session.team_code && session.team_code !== "0" ? ` · Team ${session.team_code}` : ""}</span>
            </p>
          )}
          <p className="flex items-center gap-1.5 font-mono text-xs text-faint">
            <ReceiptIcon className="size-3.5" /> {session.receipt_code}
          </p>
        </div>
      </div>

      <div className="relative mt-auto flex items-center justify-between gap-3 pt-4">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-faint">{paidUp ? "Paid" : bill.prepaid > 0 ? "Balance" : "Due now"}</p>
          {paidUp ? (
            <p className="flex items-center gap-1 font-display text-xl font-bold text-ok tabular-nums"><CheckCircle2 className="size-4" />{money(bill.prepaid, settings.currency)}</p>
          ) : (
            <p className="font-display text-xl font-bold text-white tabular-nums">{money(bill.balance, settings.currency)}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant={state === "overtime" || state === "warning" ? "primary" : "subtle"}
            size="sm"
            className="h-11 px-3 font-display text-base"
            onClick={onExtend}
            aria-label={`Add ${hoursLabel(step)}`}
            title={`Add ${hoursLabel(step)}`}
          >
            +{step >= 60 && step % 60 === 0 ? `${step / 60}h` : `${step}m`}
          </Button>
          {session.status === "paused" ? (
            <Button variant="subtle" size="sm" className="size-11 px-0" onClick={() => run(() => resume(session.id))} aria-label="Resume">
              <Play className="size-4 fill-current" />
            </Button>
          ) : (
            <Button variant="subtle" size="sm" className="size-11 px-0" onClick={() => run(() => pause(session.id))} aria-label="Pause">
              <Pause className="size-4 fill-current" />
            </Button>
          )}
          <Button variant={state === "overtime" || state === "warning" ? "outline" : "primary"} onClick={onEnd}>End & bill</Button>
        </div>
      </div>
    </motion.div>
  );
}

function ScreenLetter({ code, live, dim, color }: { code: string; live?: boolean; dim?: boolean; color?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          "grid size-12 place-items-center rounded-2xl font-display text-2xl font-bold",
          live ? "text-black" : dim ? "border border-line text-faint" : "border border-brand/30 bg-brand/5 text-brand",
        )}
        style={live ? { background: color, boxShadow: `0 0 24px -4px ${color}` } : undefined}
      >
        {code}
      </div>
      <span className="text-xs font-semibold uppercase tracking-[0.25em] text-faint">Screen</span>
    </div>
  );
}
