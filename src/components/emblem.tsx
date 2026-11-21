"use client";

import { motion } from "motion/react";
import { EMBLEM_A, EMBLEM_D } from "./emblem-paths";

interface Props {
  size?: number;
  className?: string;
  /** Play the build-up intro (circle → D → A) */
  animate?: boolean;
  /** Monochrome for thermal paper */
  mono?: boolean;
  glow?: boolean;
}

export function Emblem({ size = 40, className, animate = false, mono = false, glow = false }: Props) {
  const d = mono ? "#fff" : "#F8F400";
  const bg = mono ? "#000" : "#0a0a0a";
  const ease = [0.22, 1, 0.36, 1] as const;
  return (
    <svg
      viewBox="0 0 1024 1024"
      width={size}
      height={size}
      className={className}
      style={glow ? { filter: "drop-shadow(0 0 18px rgb(248 244 0 / 0.35))" } : undefined}
      role="img"
      aria-label="Darkroom Arcade"
    >
      <motion.circle
        cx="512" cy="512" r="512" fill={bg}
        stroke={mono ? undefined : "rgb(248 244 0 / 0.25)"} strokeWidth={mono ? 0 : 10}
        initial={animate ? { scale: 0.2, opacity: 0 } : false}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease }}
        style={{ transformOrigin: "512px 512px" }}
      />
      <motion.path
        fillRule="evenodd" fill={d} d={EMBLEM_D}
        initial={animate ? { x: -140, opacity: 0 } : false}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.35, duration: 0.7, ease }}
      />
      <motion.path
        fillRule="evenodd" fill="#fff" d={EMBLEM_A}
        initial={animate ? { y: 260, rotate: 14, opacity: 0 } : false}
        animate={{ y: 0, rotate: 0, opacity: 1 }}
        transition={{ delay: 0.6, type: "spring", stiffness: 140, damping: 14 }}
        style={{ transformOrigin: "512px 900px" }}
      />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display font-bold leading-none tracking-tight ${className}`}>
      Darkroom <span className="text-brand">Arcade</span>
    </span>
  );
}
