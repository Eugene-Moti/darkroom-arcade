"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CalendarDays, Download, Printer, ReceiptText, Search, X } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { useArcade } from "@/components/arcade-provider";
import { Receipt, type ReceiptKind } from "@/components/receipt";
import { ReceiptPrinter } from "@/components/receipt-printer";
import { ActivityLog } from "@/components/activity-log";
import { useToast } from "@/components/toast";
import { Button, Chips, Empty, Field, Input, Sheet, StatusPill } from "@/components/ui";
import { dayRange, duration, errorMessage, hm, money, ymd } from "@/lib/format";
import { downloadFile, sessionsToCsv } from "@/lib/report";
import type { Session, SessionStatus } from "@/lib/types";

type Filter = "all" | "live" | SessionStatus;

export default function ReceiptsPage() {
  const { settings, today } = useArcade();
  const toast = useToast();
  const todayKey = ymd(new Date());
  const [day, setDay] = useState(todayKey);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [rows, setRows] = useState<Session[]>([]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [open, setOpen] = useState<Session | null>(null);
  const [printing, setPrinting] = useState<{ s: Session; kind: ReceiptKind } | null>(null);
  const cur = settings?.currency ?? "KES";
  const q = query.trim();

  // Search hits all history; otherwise list the chosen day
  useEffect(() => {
    if (!q && day === todayKey) return;
    let off = false;
    const t = setTimeout(async () => {
      const sb = getSupabase();
      let req = sb.from("sessions").select("*").order("started_at", { ascending: false }).limit(200);
      if (q) {
        const safe = q.replace(/[%,()]/g, " ");
        req = req.or(`receipt_code.ilike.%${safe}%,game_title.ilike.%${safe}%,customer_name.ilike.%${safe}%,customer_phone.ilike.%${safe}%,member_no.ilike.%${safe}%,member_name.ilike.%${safe}%,team_code.eq.${safe}`);
      } else {
        const { from, to } = dayRange(day);
        req = req.gte("started_at", from).lt("started_at", to);
      }
      const { data, error } = await req;
      if (off) return;
      if (error) toast("error", "Search failed", errorMessage(error));
      setRows((data as Session[]) ?? []);
      setLoadedKey(`${q}|${day}`);
    }, q ? 300 : 0);
    return () => { off = true; clearTimeout(t); };
  }, [q, day, todayKey, toast]);

  const loading = !(!q && day === todayKey) && loadedKey !== `${q}|${day}`;
  const source = !q && day === todayKey ? today : rows;
  const list = useMemo(
    () => source.filter((s) => filter === "all" || (filter === "live" ? s.status === "active" || s.status === "paused" : s.status === filter)),
    [source, filter],
  );
  const total = list.filter((s) => s.status === "completed").reduce((a, s) => a + Number(s.amount ?? 0), 0);

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.25em] text-brand">Receipts</p>
          <h1 className="mt-1 font-display text-3xl font-bold sm:text-4xl">{q ? "Search results" : day === todayKey ? "Today" : day}</h1>
          <p className="mt-1 text-sm text-muted">{list.length} receipts · {money(total, cur)} paid</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-0 flex-1 sm:w-80 sm:flex-none">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Receipt ID, game, customer, member…" className="pl-10 pr-9" />
            {query && (
              <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-faint hover:text-white" aria-label="Clear search"><X className="size-4" /></button>
            )}
          </div>
          <label className="flex h-11 items-center gap-2 rounded-xl border border-line bg-panel/80 px-3 text-sm">
            <CalendarDays className="size-4 text-brand" />
            <input type="date" value={day} max={todayKey} onChange={(e) => { if (e.target.value) { setDay(e.target.value); setQuery(""); } }} className="bg-transparent outline-none" />
          </label>
          <Button variant="outline" icon={<Download className="size-4" />} onClick={() => downloadFile(`darkroom-receipts-${q ? "search" : day}.csv`, sessionsToCsv(list))} disabled={!list.length}>CSV</Button>
        </div>
      </header>

      <Chips<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All" },
          { value: "live", label: "Live" },
          { value: "completed", label: "Paid" },
          { value: "cancelled", label: "Void" },
        ]}
      />

      {list.length === 0 && !loading ? (
        <Empty icon={<ReceiptText className="size-7" />} title="No receipts" body={q ? "Nothing matches that search." : "No sessions were recorded for this day."} />
      ) : (
        <motion.ul className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-3 ${loading ? "opacity-50" : ""}`} layout>
          <AnimatePresence initial={false}>
            {list.map((s, i) => (
              <motion.li
                key={s.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ delay: Math.min(i, 12) * 0.025 }}
              >
                <button onClick={() => setOpen(s)} className="group w-full rounded-2xl border border-line bg-panel/80 p-4 text-left transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-[0_12px_40px_-16px_rgb(248_244_0/0.35)]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="grid size-11 place-items-center rounded-xl bg-white/[0.05] font-display text-xl font-bold text-brand">{s.screen_code}</span>
                      <div>
                        <p className="font-mono text-sm font-bold">{s.receipt_code}</p>
                        <p className="text-xs text-muted">{ymd(s.started_at)} · {hm(s.started_at)}{s.ended_at ? `–${hm(s.ended_at)}` : ""}</p>
                      </div>
                    </div>
                    <StatusPill status={s.status} />
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-2">
                    <div className="min-w-0 text-sm">
                      <p className="truncate font-semibold">{s.game_title}</p>
                      <p className="truncate text-xs text-muted">{s.member_id ? <span className="text-brand">★ {s.member_name}</span> : s.customer_name ?? "Walk-in"} · {duration(s.played_minutes)}</p>
                    </div>
                    <p className="shrink-0 font-display text-lg font-bold tabular-nums">{s.status === "completed" ? money(s.amount, cur) : s.status === "cancelled" ? "—" : "Live"}</p>
                  </div>
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      )}

      <DetailSheet
        key={open ? open.id + open.updated_at : "none"}
        session={open}
        onClose={() => setOpen(null)}
        onPrint={(s, kind) => { setOpen(null); setPrinting({ s, kind }); }}
        onSaved={(s) => { setRows((r) => r.map((x) => (x.id === s.id ? s : x))); setOpen(s); }}
      />
      <ReceiptPrinter session={printing?.s ?? null} kind={printing?.kind ?? "final"} onClose={() => setPrinting(null)} />
    </div>
  );
}

function DetailSheet({ session, onClose, onPrint, onSaved }: {
  session: Session | null;
  onClose: () => void;
  onPrint: (s: Session, kind: ReceiptKind) => void;
  onSaved: (s: Session) => void;
}) {
  const { settings } = useArcade();
  const toast = useToast();
  const [notes, setNotes] = useState(session?.notes ?? "");
  const [customer, setCustomer] = useState(session?.customer_name ?? "");
  const [busy, setBusy] = useState(false);

  if (!settings) return null;
  const live = session && (session.status === "active" || session.status === "paused");
  const dirty = session && (notes !== (session.notes ?? "") || customer !== (session.customer_name ?? ""));

  async function save() {
    if (!session) return;
    setBusy(true);
    const { data, error } = await getSupabase()
      .from("sessions")
      .update({ notes: notes.trim() || null, customer_name: customer.trim() || null })
      .eq("id", session.id)
      .select()
      .single();
    setBusy(false);
    if (error) return toast("error", "Couldn't save", errorMessage(error));
    toast("success", "Receipt updated");
    onSaved(data as Session);
  }

  return (
    <Sheet
      open={!!session}
      onClose={onClose}
      wide
      title={session?.receipt_code}
      subtitle={session ? `Screen ${session.screen_code} · ${session.game_title}` : ""}
      footer={
        session && (
          <div className="flex flex-wrap gap-2">
            {!live && <Button className="flex-1" icon={<Printer className="size-4" />} onClick={() => onPrint(session, "final")}>Reprint receipt</Button>}
            <Button variant={live ? "primary" : "outline"} className="flex-1" icon={<Printer className="size-4" />} onClick={() => onPrint(session, "ticket")}>Reprint ticket</Button>
          </div>
        )
      }
    >
      {session && (
        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="mx-auto w-full max-w-[300px] overflow-hidden rounded-lg shadow-2xl shadow-black/60 paper-tear-bottom">
            <Receipt session={session} settings={settings} kind={live ? "ticket" : "final"} />
          </div>
          <div className="space-y-4">
            <Field label="Customer name"><Input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="—" /></Field>
            <Field label="Notes">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className="w-full rounded-xl border border-line bg-white/[0.03] px-3.5 py-2.5 text-sm outline-none focus:border-brand/60" placeholder="Anything worth remembering…" />
            </Field>
            {dirty && <Button variant="subtle" loading={busy} onClick={save}>Save changes</Button>}
            <dl className="space-y-1.5 rounded-2xl border border-line p-4 text-sm">
              {[
                ["Opened by", session.staff_name],
                ["Closed by", session.closed_by_name],
                ["Member", session.member_id ? `${session.member_name} (${session.member_no})` : "Walk-in"],
                ["Member discount", Number(session.member_discount) > 0 ? `${money(session.member_discount, settings.currency)} (${session.member_discount_pct}%)` : null],
                ["Time added", session.extended_minutes ? duration(session.extended_minutes) : null],
                ["Paid upfront", Number(session.prepaid_amount) > 0 ? money(session.prepaid_amount, settings.currency) : null],
                ["Paused", session.paused_seconds ? duration(Math.round(session.paused_seconds / 60)) : null],
                ["Void reason", session.cancel_reason],
              ].filter(([, v]) => v).map(([k, v]) => (
                <div key={k as string} className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="text-right">{v}</dd></div>
              ))}
              <p className="pt-1 text-xs text-faint">Times and amounts are locked — they can only be set by the timer.</p>
            </dl>
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-faint">Activity</p>
              <ActivityLog sessionId={session.id} currency={settings.currency} />
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}
