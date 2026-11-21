"use client";

import {
  forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
} from "react";
import { AnimatePresence, animate, motion, useInView } from "motion/react";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/format";

/* ------------------------------------------------------------------ */
type Variant = "primary" | "ghost" | "outline" | "danger" | "subtle";
const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand text-black hover:bg-brand-soft shadow-[0_0_0_1px_rgb(248_244_0/0.4),0_8px_30px_-8px_rgb(248_244_0/0.55)]",
  ghost: "text-muted hover:text-white hover:bg-white/5",
  outline: "border border-line text-white hover:border-white/20 hover:bg-white/[0.03]",
  danger: "bg-bad/10 text-bad border border-bad/30 hover:bg-bad/20",
  subtle: "bg-white/[0.06] text-white hover:bg-white/10",
};

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { variant = "primary", size = "md", loading, icon, className, children, disabled, ...rest },
  ref,
) {
  const sizes = { sm: "h-9 px-3 text-sm gap-1.5 rounded-xl", md: "h-11 px-4 text-sm gap-2 rounded-xl", lg: "h-13 px-6 text-base gap-2.5 rounded-2xl" };
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center font-semibold transition-all duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
        sizes[size],
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

/* ------------------------------------------------------------------ */
export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 flex items-baseline justify-between text-xs font-medium uppercase tracking-wider text-muted">
        {label}
        {hint && <span className="normal-case tracking-normal text-faint">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-xl border border-line bg-white/[0.03] px-3.5 text-sm text-white outline-none transition placeholder:text-faint focus:border-brand/60 focus:bg-white/[0.05] focus:ring-4 focus:ring-brand/10",
        className,
      )}
      {...rest}
    />
  );
});

/* ------------------------------------------------------------------ */
export function Chips<T extends string | number>({
  options, value, onChange, className,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            type="button"
            key={String(o.value)}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative h-10 rounded-xl px-3.5 text-sm font-medium transition",
              on ? "text-black" : "border border-line text-muted hover:border-white/20 hover:text-white",
            )}
          >
            {on && (
              <motion.span
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="absolute inset-0 rounded-xl bg-brand"
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/** Bottom sheet on phones, centred dialog on larger screens. */
export function Sheet({
  open, onClose, title, subtitle, children, footer, wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6 print:hidden">
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ y: 60, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 60, opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            className={cn(
              "relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-panel shadow-2xl shadow-black sm:rounded-3xl",
              wide ? "sm:max-w-2xl" : "sm:max-w-lg",
            )}
          >
            <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-white/15 sm:hidden" />
            <header className="flex items-start gap-3 px-5 pb-3 pt-4 sm:px-6 sm:pt-5">
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-xl font-bold text-white">{title}</h2>
                {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
              </div>
              <button onClick={onClose} className="rounded-xl p-2 text-muted hover:bg-white/5 hover:text-white" aria-label="Close">
                <X className="size-5" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-5 pb-5 sm:px-6">{children}</div>
            {footer && (
              <footer className="border-t border-line bg-panel-2/60 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
                {footer}
              </footer>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/** Counts up to `value` when it scrolls into view or changes. */
export function AnimatedNumber({ value, format = (n) => Math.round(n).toLocaleString() }: { value: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const prev = useRef(0);
  const [display, setDisplay] = useState(format(0));

  useEffect(() => {
    if (!inView) return;
    const controls = animate(prev.current, value, {
      duration: 1.1,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(format(v)),
    });
    prev.current = value;
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, inView]);

  return <span ref={ref} className="tabular-nums">{display}</span>;
}

/* ------------------------------------------------------------------ */
export function Stat({
  label, value, sub, icon, accent,
}: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; accent?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "relative overflow-hidden rounded-2xl border p-4 sm:p-5",
        accent ? "border-brand/30 bg-brand/[0.06]" : "border-line bg-panel/80",
      )}
    >
      <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-muted">
        {label}
        <span className={accent ? "text-brand" : "text-faint"}>{icon}</span>
      </div>
      <div className={cn("mt-2 font-display text-2xl font-bold sm:text-3xl", accent ? "text-brand glow-text" : "text-white")}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </motion.div>
  );
}

export function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-line px-6 py-14 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-white/[0.04] text-faint">{icon}</div>
      <p className="font-display text-lg font-semibold text-white">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-emerald-400/10 text-emerald-300 border-emerald-400/20",
    paused: "bg-sky-400/10 text-sky-300 border-sky-400/20",
    completed: "bg-white/5 text-muted border-line",
    cancelled: "bg-bad/10 text-bad border-bad/25",
  };
  const label: Record<string, string> = { active: "Live", paused: "Paused", completed: "Paid", cancelled: "Void" };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", map[status])}>
      {status === "active" && <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />}
      {label[status] ?? status}
    </span>
  );
}

/* ------------------------------------------------------------------ */
export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)} className="flex items-center gap-2 disabled:opacity-50">
      <span className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", on ? "bg-brand" : "bg-white/10")}>
        <motion.span layout transition={{ type: "spring", stiffness: 500, damping: 30 }} className={cn("absolute top-1 size-5 rounded-full shadow", on ? "right-1 bg-black" : "left-1 bg-white/70")} />
      </span>
      {label && <span className="w-6 text-xs text-muted">{label}</span>}
    </button>
  );
}

/** A labelled on/off row used in sheets and settings. */
export function ToggleRow({ title, sub, on, onChange, icon, disabled }: { title: string; sub?: ReactNode; on: boolean; onChange: (v: boolean) => void; icon?: ReactNode; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-line p-4">
      <div className="flex min-w-0 items-center gap-3">
        {icon && <span className="shrink-0 text-brand">{icon}</span>}
        <div className="min-w-0">
          <p className="font-semibold">{title}</p>
          {sub && <p className="text-sm text-muted">{sub}</p>}
        </div>
      </div>
      <Toggle on={on} onChange={onChange} disabled={disabled} />
    </div>
  );
}
