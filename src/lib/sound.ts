// Tiny Web Audio synth — no audio files to ship or cache.
let ctx: AudioContext | null = null;

function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function soundEnabled() {
  try {
    return localStorage.getItem("dra:sound") !== "off";
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem("dra:sound", on ? "on" : "off");
  } catch {}
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", gain = 0.15) {
  const a = ac();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime + start);
  g.gain.setValueAtTime(0.0001, a.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, a.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + start);
  o.stop(a.currentTime + start + dur + 0.05);
}

/** Rising arcade "power-up" — session started */
export function playStart() {
  if (!soundEnabled()) return;
  [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.07, 0.18, "square", 0.06));
}

/** Coin chime — session paid */
export function playCoin() {
  if (!soundEnabled()) return;
  tone(988, 0, 0.08, "square", 0.07);
  tone(1319, 0.08, 0.35, "square", 0.07);
}

/** Two-tone alarm — time's up */
export function playAlarm() {
  if (!soundEnabled()) return;
  for (let i = 0; i < 3; i++) {
    tone(880, i * 0.5, 0.22, "sawtooth", 0.08);
    tone(660, i * 0.5 + 0.25, 0.22, "sawtooth", 0.08);
  }
}

/** Soft blip — warning */
export function playBlip() {
  if (!soundEnabled()) return;
  tone(740, 0, 0.12, "triangle", 0.12);
  tone(740, 0.18, 0.12, "triangle", 0.12);
}

/** Thermal-printer buzz: filtered noise bursts for `seconds` */
export function playPrinter(seconds = 2.2) {
  if (!soundEnabled()) return;
  const a = ac();
  if (!a) return;
  const len = Math.floor(a.sampleRate * seconds);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / a.sampleRate;
    const chatter = Math.sin(t * 2 * Math.PI * 38) > 0 ? 1 : 0.35; // line-feed rhythm
    data[i] = (Math.random() * 2 - 1) * chatter * 0.5;
  }
  const src = a.createBufferSource();
  src.buffer = buf;
  const bp = a.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 2400;
  bp.Q.value = 0.9;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.09, a.currentTime + 0.05);
  g.gain.setValueAtTime(0.09, a.currentTime + seconds - 0.15);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + seconds);
  src.connect(bp).connect(g).connect(a.destination);
  src.start();
}
