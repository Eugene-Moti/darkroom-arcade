"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Session } from "@/lib/types";
import type { Bucket } from "@/lib/report";
import { hourLabel } from "@/lib/report";
import { cn, duration, hm, money } from "@/lib/format";

/* Shared tooltip ---------------------------------------------------- */
function Tip({ show, x, children }: { show: boolean; x: string; children: ReactNode }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-xl border border-line bg-[#1c1c21] px-3 py-2 text-xs shadow-xl shadow-black/60"
          style={{ left: x }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function niceMax(v: number) {
  if (v <= 4) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/* Sessions started per hour ---------------------------------------- */
export function HourlyBars({ hours, currency, peak }: { hours: Bucket[]; currency: string; peak: number | null }) {
  const active = hours.map((h, i) => (h.sessions ? i : -1)).filter((i) => i >= 0);
  const from = Math.min(8, ...(active.length ? active : [8]));
  const to = Math.max(23, ...(active.length ? active : [23]));
  const slice = hours.slice(from, to + 1);
  const max = niceMax(Math.max(...slice.map((h) => h.sessions), 1));
  const [hover, setHover] = useState<number | null>(null);

  return (
    <div className="relative">
      <div className="relative flex h-52 items-end gap-[2px] border-b border-line pl-7">
        {/* recessive grid */}
        {[0.5, 1].map((t) => (
          <div key={t} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-white/[0.05]" style={{ bottom: `${t * 100}%` }}>
            <span className="absolute -top-2 left-0 text-[10px] tabular-nums text-faint">{Math.round(max * t)}</span>
          </div>
        ))}
        {slice.map((h, i) => {
          const hr = from + i;
          const pct = (h.sessions / max) * 100;
          return (
            <div
              key={hr}
              className="relative flex h-full flex-1 items-end"
              onMouseEnter={() => setHover(hr)}
              onMouseLeave={() => setHover(null)}
              onClick={() => setHover(hover === hr ? null : hr)}
            >
              <div className={cn("absolute inset-0 rounded-t-md transition-colors", hover === hr && "bg-white/[0.03]")} />
              <motion.div
                className={cn("relative w-full rounded-t-[4px]", h.sessions ? "bg-brand" : "bg-white/[0.06]", hr === peak && "shadow-[0_0_16px_-2px_rgb(248_244_0/0.7)]")}
                initial={{ height: 0 }}
                animate={{ height: h.sessions ? `${Math.max(pct, 2)}%` : "2px" }}
                transition={{ delay: i * 0.02, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                style={{ opacity: hover == null || hover === hr ? 1 : 0.45 }}
              />
              <Tip show={hover === hr} x="50%">
                <p className="font-semibold text-white">{hourLabel(hr)} – {hourLabel(hr + 1).replace("24", "00")}</p>
                <p className="text-muted">{h.sessions} session{h.sessions === 1 ? "" : "s"} started</p>
                <p className="text-muted">{duration(h.minutes)} played · {money(h.revenue, currency)}</p>
              </Tip>
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-[2px] pl-7">
        {slice.map((_, i) => {
          const hr = from + i;
          return (
            <span key={hr} className={cn("flex-1 text-center text-[10px] tabular-nums", hr === peak ? "font-bold text-brand" : "text-faint")}>
              {hr % 2 === 0 || slice.length < 14 ? String(hr).padStart(2, "0") : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* Screen occupancy timeline (Gantt) -------------------------------- */
export function Timeline({ sessions, screens, now, currency }: { sessions: Session[]; screens: string[]; now: number; currency: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const starts = sessions.map((s) => new Date(s.started_at).getHours());
  const ends = sessions.map((s) => {
    const d = new Date(s.ended_at ?? now);
    return d.getHours() + (d.getMinutes() > 0 ? 1 : 0);
  });
  const from = Math.min(8, ...starts);
  const to = Math.min(24, Math.max(23, ...ends));
  const span = (to - from) * 60;
  const day0 = sessions[0] ? new Date(sessions[0].started_at) : new Date();
  day0.setHours(from, 0, 0, 0);
  const pos = (iso: string | number) => ((new Date(iso).getTime() - day0.getTime()) / 60000 / span) * 100;
  const rows = [...new Set([...screens, ...sessions.map((s) => s.screen_code)])].sort();

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="relative ml-10 h-5">
          {Array.from({ length: to - from + 1 }, (_, i) => (
            <span key={i} className="absolute -translate-x-1/2 text-[10px] tabular-nums text-faint" style={{ left: `${(i / (to - from)) * 100}%` }}>
              {(i + from) % 2 === 0 ? String((i + from) % 24).padStart(2, "0") : ""}
            </span>
          ))}
        </div>
        <div className="space-y-1.5">
          {rows.map((code, r) => (
            <div key={code} className="flex items-center gap-2">
              <span className="w-8 shrink-0 text-center font-display text-sm font-bold text-muted">{code}</span>
              <div className="relative h-9 flex-1 rounded-lg bg-white/[0.025]">
                {Array.from({ length: to - from - 1 }, (_, i) => (
                  <div key={i} className="absolute inset-y-0 border-l border-white/[0.04]" style={{ left: `${((i + 1) / (to - from)) * 100}%` }} />
                ))}
                {sessions.filter((s) => s.screen_code === code).map((s) => {
                  const left = Math.max(0, pos(s.started_at));
                  const width = Math.max(0.6, Math.min(100, pos(s.ended_at ?? now)) - left);
                  const live = !s.ended_at;
                  const voided = s.status === "cancelled";
                  return (
                    <motion.div
                      key={s.id}
                      initial={{ scaleX: 0, opacity: 0 }}
                      animate={{ scaleX: 1, opacity: 1 }}
                      transition={{ delay: r * 0.05, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                      onMouseEnter={() => setHover(s.id)}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => setHover(hover === s.id ? null : s.id)}
                      className={cn(
                        "absolute inset-y-1 origin-left cursor-default rounded-[4px] ring-2 ring-panel",
                        voided ? "border border-dashed border-bad/70 bg-bad/10" : live ? "bg-brand/70" : "bg-brand",
                        hover && hover !== s.id && "opacity-50",
                      )}
                      style={{ left: `${left}%`, width: `${width}%` }}
                    >
                      {live && <span className="absolute inset-y-0 right-0 w-1.5 animate-pulse rounded-r-[4px] bg-white" />}
                      <Tip show={hover === s.id} x="50%">
                        <p className="font-semibold text-white">{s.receipt_code} · {s.game_title}</p>
                        <p className="text-muted">{hm(s.started_at)} – {s.ended_at ? hm(s.ended_at) : "now"} · Team {s.team_code}</p>
                        <p className="text-muted">{voided ? `Void: ${s.cancel_reason ?? ""}` : live ? "In progress" : `${duration(s.played_minutes)} · ${money(s.amount, currency)}`}</p>
                      </Tip>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-4 pl-10 text-xs text-muted">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-[3px] bg-brand" />Paid</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-[3px] bg-brand/70" />In progress</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-[3px] border border-dashed border-bad/70" />Void</span>
        </div>
      </div>
    </div>
  );
}

/* Ranked horizontal bars ------------------------------------------- */
export function RankBars({ rows, currency, metric = "revenue" }: { rows: Bucket[]; currency: string; metric?: "revenue" | "sessions" }) {
  const max = Math.max(...rows.map((r) => (metric === "revenue" ? r.revenue : r.sessions)), 1);
  if (!rows.length) return <p className="py-6 text-center text-sm text-faint">No data</p>;
  return (
    <ul className="space-y-3">
      {rows.slice(0, 8).map((r, i) => {
        const v = metric === "revenue" ? r.revenue : r.sessions;
        return (
          <li key={r.key}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-medium text-white">{r.key}</span>
              <span className="shrink-0 tabular-nums text-muted">
                {r.sessions} · {duration(r.minutes)} · <span className="font-semibold text-white">{money(r.revenue, currency)}</span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/[0.05]">
              <motion.div
                className="h-full rounded-full bg-brand"
                initial={{ width: 0 }}
                animate={{ width: `${(v / max) * 100}%` }}
                transition={{ delay: i * 0.06, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* 7-day revenue trend ---------------------------------------------- */
export function TrendBars({ days, currency, selected, onSelect }: {
  days: { day: string; label: string; revenue: number; sessions: number }[];
  currency: string;
  selected: string;
  onSelect: (d: string) => void;
}) {
  const max = niceMax(Math.max(...days.map((d) => d.revenue), 1));
  const [hover, setHover] = useState<string | null>(null);
  return (
    <div>
      <div className="flex h-36 items-end gap-2 border-b border-line">
        {days.map((d, i) => (
          <button
            key={d.day}
            onClick={() => onSelect(d.day)}
            onMouseEnter={() => setHover(d.day)}
            onMouseLeave={() => setHover(null)}
            className="relative flex h-full flex-1 items-end"
            aria-label={`${d.label}: ${money(d.revenue, currency)}`}
          >
            <motion.div
              className={cn("w-full rounded-t-[4px]", d.day === selected ? "bg-brand" : "bg-brand/35 hover:bg-brand/60")}
              initial={{ height: 0 }}
              animate={{ height: `${Math.max((d.revenue / max) * 100, 1.5)}%` }}
              transition={{ delay: i * 0.05, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            />
            <Tip show={hover === d.day} x="50%">
              <p className="font-semibold text-white">{d.label}</p>
              <p className="text-muted">{money(d.revenue, currency)} · {d.sessions} sessions</p>
            </Tip>
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex gap-2">
        {days.map((d) => (
          <span key={d.day} className={cn("flex-1 text-center text-[11px]", d.day === selected ? "font-bold text-brand" : "text-faint")}>
            {d.label.slice(0, 3)}
          </span>
        ))}
      </div>
    </div>
  );
}
