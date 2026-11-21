"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/* Per-device printer preferences (each till / tablet can differ). */
export interface PrintPrefs {
  paper: "80" | "58" | "a4";
  copies: "both" | "customer";
  autoPrint: boolean;
}
const DEFAULT_PREFS: PrintPrefs = { paper: "80", copies: "both", autoPrint: false };

export function readPrintPrefs(): PrintPrefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem("dra:print") ?? "{}") };
  } catch {
    return DEFAULT_PREFS;
  }
}
export function savePrintPrefs(p: PrintPrefs) {
  try {
    localStorage.setItem("dra:print", JSON.stringify(p));
  } catch {}
}

const PAPER_WIDTH: Record<PrintPrefs["paper"], string> = { "80": "72mm", "58": "48mm", a4: "80mm" };

const PrintCtx = createContext<(pages: ReactNode[]) => void>(() => {});
export const usePrint = () => useContext(PrintCtx);

/**
 * Renders the given pages into #print-root (outside the app tree) and opens
 * the browser print dialog. Each page is separated with a page break, which
 * thermal printer drivers translate into a paper cut.
 */
export function PrintProvider({ children }: { children: ReactNode }) {
  const [pages, setPages] = useState<ReactNode[] | null>(null);
  // pages are only ever set on the client, so `document` exists whenever they do
  const target = pages ? document.getElementById("print-root") : null;

  useEffect(() => {
    if (!pages || !target) return;
    target.style.setProperty("--paper-width", PAPER_WIDTH[readPrintPrefs().paper]);
    const clear = () => setPages(null);
    window.addEventListener("afterprint", clear, { once: true });
    const raf = requestAnimationFrame(() => setTimeout(() => window.print(), 50));
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("afterprint", clear);
    };
  }, [pages, target]);

  const print = useCallback((p: ReactNode[]) => setPages(p), []);

  return (
    <PrintCtx.Provider value={print}>
      {children}
      {pages && target &&
        createPortal(
          pages.map((p, i) => (
            <div key={i} className="print-page">
              {p}
            </div>
          )),
          target,
        )}
    </PrintCtx.Provider>
  );
}
