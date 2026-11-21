"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Lock, Mail, MailCheck, User } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { Emblem, Wordmark } from "@/components/emblem";
import { Button, Field, Input } from "@/components/ui";
import { cn, errorMessage } from "@/lib/format";

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}

function Login() {
  const params = useSearchParams();
  const router = useRouter();
  const next = params.get("next");
  const dest = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("confirm") === "failed" ? "That confirmation link is invalid or expired." : null);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = getSupabase();
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(dest);
        router.refresh();
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name.trim() }, emailRedirectTo: `${location.origin}/auth/callback` },
      });
      if (error) throw error;
      if (data.session) {
        router.replace("/");
        router.refresh();
      }
      else setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="arcade-bg relative grid min-h-dvh place-items-center overflow-hidden p-4">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 animate-scan bg-gradient-to-b from-transparent via-brand/[0.05] to-transparent" />
      <div className="pointer-events-none absolute -left-40 bottom-0 size-[28rem] rounded-full bg-brand/10 blur-[120px]" />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="animate-float">
            <Emblem size={96} animate glow />
          </div>
          <Wordmark className="mt-5 text-3xl" />
          <p className="mt-2 text-sm text-muted">Staff console · sessions, receipts & reports</p>
        </div>

        <div className="rounded-3xl border border-line bg-panel/85 p-6 shadow-2xl shadow-black/60 backdrop-blur-xl sm:p-7">
          <AnimatePresence mode="wait">
            {sent ? (
              <motion.div key="sent" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="py-4 text-center">
                <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-brand/10 text-brand"><MailCheck className="size-7" /></div>
                <h2 className="font-display text-xl font-bold">Check your inbox</h2>
                <p className="mt-2 text-sm text-muted">We sent a confirmation link to <b className="text-white">{email}</b>. After confirming, an admin will approve your account.</p>
                <Button variant="outline" className="mt-6" onClick={() => { setSent(false); setMode("in"); }}>Back to sign in</Button>
              </motion.div>
            ) : (
              <motion.form key="form" onSubmit={submit} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                <div className="relative grid grid-cols-2 rounded-2xl bg-white/[0.04] p-1">
                  {(["in", "up"] as const).map((m) => (
                    <button key={m} type="button" onClick={() => setMode(m)} className={cn("relative h-10 rounded-xl text-sm font-semibold transition", mode === m ? "text-black" : "text-muted hover:text-white")}>
                      {mode === m && <motion.span layoutId="auth-tab" className="absolute inset-0 rounded-xl bg-brand" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
                      <span className="relative">{m === "in" ? "Sign in" : "Create account"}</span>
                    </button>
                  ))}
                </div>

                <AnimatePresence initial={false}>
                  {mode === "up" && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <Field label="Full name">
                        <IconInput icon={<User className="size-4" />} value={name} onChange={setName} placeholder="Jane Doe" required autoComplete="name" />
                      </Field>
                    </motion.div>
                  )}
                </AnimatePresence>
                <Field label="Email">
                  <IconInput icon={<Mail className="size-4" />} type="email" value={email} onChange={setEmail} placeholder="you@darkroom.com" required autoComplete="email" />
                </Field>
                <Field label="Password">
                  <IconInput icon={<Lock className="size-4" />} type="password" value={password} onChange={setPassword} placeholder="••••••••" required minLength={6} autoComplete={mode === "in" ? "current-password" : "new-password"} />
                </Field>

                <AnimatePresence>
                  {error && (
                    <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-xl border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">
                      {error}
                    </motion.p>
                  )}
                </AnimatePresence>

                <Button type="submit" size="lg" className="w-full" loading={busy}>
                  {mode === "in" ? "Enter the arcade" : "Create account"} <ArrowRight className="size-5" />
                </Button>
                {mode === "up" && <p className="text-center text-xs text-faint">The first account becomes the admin. Others need admin approval.</p>}
              </motion.form>
            )}
          </AnimatePresence>
        </div>
        <p className="mt-6 text-center text-xs text-faint">Darkroom Arcade · Staff console</p>
      </motion.div>
    </div>
  );
}

function IconInput({
  icon, onChange, ...rest
}: { icon: React.ReactNode; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange">) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint">{icon}</span>
      <Input {...rest} onChange={(e) => onChange(e.target.value)} className="pl-10" />
    </div>
  );
}
