export type Role = "admin" | "staff" | "pending";
export type SessionStatus = "active" | "paused" | "completed" | "cancelled";
export type PaymentMethod = "cash" | "mpesa" | "card" | "other";

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
  created_at: string;
}

export interface Settings {
  id: 1;
  shop_name: string;
  tagline: string | null;
  phone: string | null;
  location: string | null;
  currency: string;
  default_hourly_rate: number;
  billing_increment_minutes: number;
  grace_minutes: number;
  minimum_minutes: number;
  warn_before_minutes: number;
  receipt_prefix: string;
  receipt_note: string | null;
  receipt_footer: string | null;
  /** Customers may play without booking hours (billed on exit) */
  allow_open_time: boolean;
  /** Booked hours are charged in full even if the customer leaves early */
  charge_booked_time: boolean;
  /** "Pay now" is switched on by default when starting / adding time */
  prepay_default: boolean;
  /** Largest discount staff may give, as % of the bill (admins: unlimited) */
  staff_max_discount_pct: number;
  /** Staff may void a receipt only this many minutes after it starts (0 = admins only) */
  staff_void_window_minutes: number;
  /** IANA timezone used for offer days/times, e.g. Africa/Nairobi */
  timezone: string;
  /** Print a "become a member" box on walk-in receipts */
  receipt_show_membership: boolean;
  membership_pitch: string | null;
  updated_at: string;
}

export interface Screen {
  id: string;
  code: string;
  name: string | null;
  console: string;
  hourly_rate: number | null;
  is_active: boolean;
  sort_order: number;
}

export interface Game {
  id: string;
  title: string;
  console: string;
  is_active: boolean;
  sort_order: number;
}

export interface Session {
  id: string;
  receipt_no: number;
  receipt_code: string;
  team_code: string;
  customer_name: string | null;
  customer_phone: string | null;
  players: number;
  screen_id: string | null;
  screen_code: string;
  console: string;
  game_title: string;
  started_at: string;
  planned_minutes: number | null;
  /** Minutes added after the start (+1h etc.) — already included in planned_minutes */
  extended_minutes: number;
  /** Money collected before checkout (upfront + for added time) */
  prepaid_amount: number;
  paused_at: string | null;
  paused_seconds: number;
  ended_at: string | null;
  status: SessionStatus;
  hourly_rate: number;
  played_minutes: number | null;
  billed_minutes: number | null;
  gross_amount: number | null;
  discount: number;
  amount: number | null;
  payment_method: PaymentMethod | null;
  notes: string | null;
  cancel_reason: string | null;
  staff_name: string | null;
  closed_by_name: string | null;
  /* Member snapshot (null for walk-ins) */
  member_id: string | null;
  member_no: string | null;
  member_name: string | null;
  member_plan: string | null;
  member_expires_at: string | null;
  member_discount_pct: number;
  /** Why the member discount applies, e.g. "Monthly member" or an offer title */
  offer_title: string | null;
  member_discount: number;
  created_at: string;
  updated_at: string;
}

export interface MembershipPlan {
  id: string;
  name: string;
  duration_days: number;
  price: number;
  discount_pct: number;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}

export type OfferKind = "percent" | "perk";

export interface MemberOffer {
  id: string;
  title: string;
  description: string | null;
  kind: OfferKind;
  discount_pct: number | null;
  /** null = every member */
  plan_id: string | null;
  /** 0 = Sun … 6 = Sat; null/empty = every day */
  days: number[] | null;
  /** "HH:MM:SS"; null = all day */
  start_time: string | null;
  end_time: string | null;
  valid_from: string | null;
  valid_to: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface Member {
  id: string;
  member_no: string;
  full_name: string;
  phone: string | null;
  notes: string | null;
  plan_id: string | null;
  joined_at: string;
  expires_at: string | null;
  is_active: boolean;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface MembershipSale {
  id: number;
  receipt_code: string | null;
  member_id: string;
  plan_id: string | null;
  plan_name: string;
  kind: "join" | "renew";
  amount: number;
  method: PaymentMethod | null;
  period_start: string;
  period_end: string;
  staff_name: string | null;
  created_at: string;
}

export type EventKind = "start" | "pause" | "resume" | "extend" | "move" | "member" | "payment" | "refund" | "end" | "void";

export interface SessionEvent {
  id: number;
  session_id: string;
  kind: EventKind;
  minutes: number | null;
  amount: number | null;
  method: PaymentMethod | null;
  detail: string | null;
  staff_name: string | null;
  created_at: string;
}

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  mpesa: "M-Pesa",
  card: "Card",
  other: "Other",
};
