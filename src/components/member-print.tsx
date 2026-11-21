"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { MemberResult } from "./arcade-provider";
import { MembershipPrinter } from "./receipt-printer";

const Ctx = createContext<(r: MemberResult) => void>(() => {});

/** Print a membership receipt / member card with the printer animation, from anywhere. */
export const usePrintMembership = () => useContext(Ctx);

export function MemberPrintProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<MemberResult | null>(null);
  const show = useCallback((r: MemberResult) => setData(r), []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <MembershipPrinter data={data} onClose={() => setData(null)} />
    </Ctx.Provider>
  );
}
