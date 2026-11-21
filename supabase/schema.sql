-- =====================================================================
--  Darkroom Arcade — database schema
--  Run once in Supabase Dashboard → SQL Editor → New query → Run.
--  Safe to re-run: every object is created with IF NOT EXISTS / OR REPLACE.
-- =====================================================================


-- ---------------------------------------------------------------------
--  Staff profiles & roles
--  The FIRST user to sign up becomes 'admin'. Everyone after starts as
--  'pending' and can see nothing until an admin approves them in
--  Settings → Team. Admins manage settings, screens, games and rates.
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text,
  role        text not null default 'pending' check (role in ('admin', 'staff', 'pending')),
  created_at  timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    case when exists (select 1 from public.profiles) then 'pending' else 'admin' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for users that existed before this script ran
insert into public.profiles (id, email, full_name, role)
select u.id, u.email, split_part(u.email, '@', 1),
       case when row_number() over (order by u.created_at) = 1
             and not exists (select 1 from public.profiles) then 'admin' else 'staff' end
from auth.users u
on conflict (id) do nothing;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'staff'));
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ---------------------------------------------------------------------
--  Shop settings (single row)
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  id                         int primary key default 1 check (id = 1),
  shop_name                  text not null default 'Darkroom Arcade',
  tagline                    text default 'PS5 Gaming Lounge',
  phone                      text,
  location                   text,
  currency                   text not null default 'KES',
  default_hourly_rate        numeric(10, 2) not null default 200,
  billing_increment_minutes  int not null default 60 check (billing_increment_minutes between 1 and 60),
  grace_minutes              int not null default 5 check (grace_minutes between 0 and 30),
  minimum_minutes            int not null default 60 check (minimum_minutes between 0 and 240),
  warn_before_minutes        int not null default 5 check (warn_before_minutes between 0 and 60),
  receipt_prefix             text not null default 'DKR',
  receipt_note               text default 'Present this receipt on the reception desk when your session is over',
  receipt_footer             text default 'Thank You and Have Great Gaming Time!',
  updated_at                 timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

-- Shop rules (added in v2). Admins change these in Settings → Pricing,
-- or directly in Supabase → Table Editor → settings.
alter table public.settings alter column billing_increment_minutes set default 60;
alter table public.settings alter column minimum_minutes set default 60;
alter table public.settings add column if not exists allow_open_time boolean not null default true;
alter table public.settings add column if not exists charge_booked_time boolean not null default true;
alter table public.settings add column if not exists prepay_default boolean not null default true;
alter table public.settings add column if not exists staff_max_discount_pct int not null default 100;
alter table public.settings add column if not exists staff_void_window_minutes int not null default 15;
do $$
begin
  alter table public.settings add constraint settings_discount_pct_range check (staff_max_discount_pct between 0 and 100);
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table public.settings add constraint settings_void_window_range check (staff_void_window_minutes between 0 and 1440);
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------
--  Screens (stations) and game catalogue
-- ---------------------------------------------------------------------
create table if not exists public.screens (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,                 -- 'A', 'B', ...
  name         text,                                 -- optional label e.g. 'VIP Couch'
  console      text not null default 'PS5',
  hourly_rate  numeric(10, 2),                       -- null = use default rate
  is_active    boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

create table if not exists public.games (
  id          uuid primary key default gen_random_uuid(),
  title       text not null unique,
  console     text not null default 'PS5',
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

insert into public.screens (code, sort_order)
select c, ord from unnest(array['A','B','C','D','E']) with ordinality as t(c, ord)
on conflict (code) do nothing;

insert into public.games (title, sort_order)
select g, ord from unnest(array['FC 27','GTA V','Call of Duty','Mortal Kombat 1','NBA 2K27','Tekken 8','UFC 5','Fortnite'])
  with ordinality as t(g, ord)
on conflict (title) do nothing;

-- ---------------------------------------------------------------------
--  Sessions (one row = one receipt)
-- ---------------------------------------------------------------------
-- Continues the paper receipt numbering (last seen: DKR15518).
create sequence if not exists public.receipt_seq start with 15519;

create table if not exists public.sessions (
  id               uuid primary key default gen_random_uuid(),
  receipt_no       bigint not null unique default nextval('public.receipt_seq'),
  receipt_code     text not null unique,
  team_code        text not null default '0',
  customer_name    text,
  customer_phone   text,
  players          int not null default 1 check (players between 1 and 16),
  screen_id        uuid references public.screens (id),
  screen_code      text not null,
  console          text not null default 'PS5',
  game_title       text not null,
  started_at       timestamptz not null default now(),
  planned_minutes  int check (planned_minutes is null or planned_minutes > 0),
  paused_at        timestamptz,
  paused_seconds   int not null default 0,
  ended_at         timestamptz,
  status           text not null default 'active'
                   check (status in ('active', 'paused', 'completed', 'cancelled')),
  hourly_rate      numeric(10, 2) not null,
  played_minutes   int,
  billed_minutes   int,
  gross_amount     numeric(10, 2),
  discount         numeric(10, 2) not null default 0,
  amount           numeric(10, 2),
  payment_method   text check (payment_method in ('cash', 'mpesa', 'card', 'other')),
  notes            text,
  cancel_reason    text,
  created_by       uuid default auth.uid() references auth.users (id),
  staff_name       text,
  closed_by_name   text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists sessions_started_at_idx on public.sessions (started_at desc);
create index if not exists sessions_status_idx on public.sessions (status);
-- A screen can only host one running session at a time
create unique index if not exists sessions_one_live_per_screen
  on public.sessions (screen_id) where status in ('active', 'paused');

-- v2: time added after the start, and money taken before checkout
alter table public.sessions add column if not exists extended_minutes int not null default 0;
alter table public.sessions add column if not exists prepaid_amount numeric(10, 2) not null default 0;

-- ---------------------------------------------------------------------
--  Session activity log: who did what, when — and every shilling taken.
--  Written only by the RPCs below. Cash-up totals come from here, so a
--  session paid partly upfront and partly at checkout adds up correctly.
-- ---------------------------------------------------------------------
create table if not exists public.session_events (
  id          bigint generated by default as identity primary key,
  session_id  uuid not null references public.sessions (id),
  kind        text not null check (kind in ('start', 'pause', 'resume', 'extend', 'move', 'payment', 'refund', 'end', 'void')),
  minutes     int,
  amount      numeric(10, 2),
  method      text check (method in ('cash', 'mpesa', 'card', 'other')),
  detail      text,
  staff_name  text,
  created_at  timestamptz not null default now()
);
create index if not exists session_events_session_idx on public.session_events (session_id, id);
create index if not exists session_events_created_idx on public.session_events (created_at);
alter table public.session_events drop constraint if exists session_events_kind_check;
alter table public.session_events add constraint session_events_kind_check
  check (kind in ('start', 'pause', 'resume', 'extend', 'move', 'member', 'payment', 'refund', 'end', 'void'));

-- ---------------------------------------------------------------------
--  Membership (v3)
--  Admins define plans (how long + price + member discount) and offers
--  (extra discounts at set days/times, or perks printed on receipts).
--  Staff sign members up / renew them; the server applies the discount.
-- ---------------------------------------------------------------------
alter table public.settings add column if not exists timezone text not null default 'Africa/Nairobi';
alter table public.settings add column if not exists receipt_show_membership boolean not null default true;
alter table public.settings add column if not exists membership_pitch text
  default 'Become a member and pay less for every hour you play. Ask at the reception desk!';

create table if not exists public.membership_plans (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  duration_days  int not null check (duration_days between 1 and 3660),
  price          numeric(10, 2) not null default 0 check (price >= 0),
  discount_pct   int not null default 0 check (discount_pct between 0 and 100),
  description    text,
  is_active      boolean not null default true,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now()
);

create table if not exists public.member_offers (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  kind          text not null default 'percent' check (kind in ('percent', 'perk')),
  discount_pct  int check (discount_pct is null or discount_pct between 0 and 100),
  plan_id       uuid references public.membership_plans (id) on delete cascade,  -- null = every member
  days          int[],                                                           -- 0 = Sun … 6 = Sat; null = every day
  start_time    time,                                                            -- null = all day
  end_time      time,
  valid_from    date,
  valid_to      date,
  is_active     boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

create sequence if not exists public.member_seq start with 1;

create table if not exists public.members (
  id               uuid primary key default gen_random_uuid(),
  member_no        text not null unique,                       -- M0001
  full_name        text not null,
  phone            text,
  notes            text,
  plan_id          uuid references public.membership_plans (id),
  joined_at        timestamptz not null default now(),
  expires_at       timestamptz,                                -- membership valid until
  is_active        boolean not null default true,
  created_by_name  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
-- One member per phone number (compares the last 9 digits, so 07… and +2547… match)
create unique index if not exists members_phone_key on public.members ((right(regexp_replace(phone, '\D', '', 'g'), 9)))
  where phone is not null and length(regexp_replace(phone, '\D', '', 'g')) >= 9;

create table if not exists public.membership_sales (
  id            bigint generated by default as identity primary key,
  receipt_code  text unique,
  member_id     uuid not null references public.members (id),
  plan_id       uuid references public.membership_plans (id) on delete set null,
  plan_name     text not null,
  kind          text not null check (kind in ('join', 'renew')),
  amount        numeric(10, 2) not null default 0,
  method        text check (method in ('cash', 'mpesa', 'card', 'other')),
  period_start  timestamptz not null,
  period_end    timestamptz not null,
  staff_name    text,
  created_at    timestamptz not null default now()
);
create index if not exists membership_sales_created_idx on public.membership_sales (created_at);
create index if not exists membership_sales_member_idx on public.membership_sales (member_id);

-- Member details are snapshotted on each receipt so old receipts never change
alter table public.sessions add column if not exists member_id uuid references public.members (id);
alter table public.sessions add column if not exists member_no text;
alter table public.sessions add column if not exists member_name text;
alter table public.sessions add column if not exists member_plan text;
alter table public.sessions add column if not exists member_expires_at timestamptz;
alter table public.sessions add column if not exists member_discount_pct int not null default 0;
alter table public.sessions add column if not exists offer_title text;
alter table public.sessions add column if not exists member_discount numeric(10, 2) not null default 0;
create index if not exists sessions_member_idx on public.sessions (member_id);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists sessions_touch on public.sessions;
create trigger sessions_touch before update on public.sessions
  for each row execute function public.touch_updated_at();

drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

drop trigger if exists members_touch on public.members;
create trigger members_touch before update on public.members
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
--  Billing helpers (mirrored in src/lib/billing.ts for live previews)
-- ---------------------------------------------------------------------
create or replace function public.billable_minutes(p_played int)
returns int language sql stable as $$
  select greatest(
    s.minimum_minutes,
    (ceil(greatest(p_played - s.grace_minutes, 0)::numeric / s.billing_increment_minutes)
      * s.billing_increment_minutes)::int
  )
  from public.settings s where s.id = 1;
$$;

create or replace function public.played_minutes(s public.sessions, p_at timestamptz default now())
returns int language sql stable as $$
  select greatest(0, floor((
      extract(epoch from (coalesce(s.ended_at, p_at) - s.started_at))
      - s.paused_seconds
      - case when s.paused_at is not null and s.ended_at is null
             then extract(epoch from (p_at - s.paused_at)) else 0 end
    ) / 60))::int;
$$;

create or replace function public.assert_staff()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then
    raise exception 'Not authorised';
  end if;
end $$;

create or replace function public.server_now()
returns timestamptz language sql stable as $$ select now(); $$;

create or replace function public.my_name()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(full_name, email) from public.profiles where id = auth.uid();
$$;

-- Price of a block of booked time (respects minimum, grace and block size)
create or replace function public.booked_price(p_rate numeric, p_minutes int)
returns numeric language sql stable as $$
  select round(p_rate * public.billable_minutes(p_minutes) / 60.0, 2);
$$;

-- Amount after a member discount (mirrored in src/lib/billing.ts)
create or replace function public.member_net(p_amount numeric, p_pct int)
returns numeric language sql immutable as $$
  select p_amount - round(p_amount * coalesce(p_pct, 0) / 100.0, 2);
$$;

-- The best discount a member gets at a moment in time: their plan's discount,
-- or a better matching offer (day of week / time of day / date range, in the
-- shop's timezone). Expired or deactivated members get nothing.
create or replace function public.member_benefit(p_member_id uuid, p_at timestamptz default now())
returns table (pct int, title text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_m public.members; v_plan public.membership_plans; v_local timestamp;
  v_best int := 0; v_title text; v_opct int; v_otitle text;
begin
  select * into v_m from public.members where id = p_member_id;
  if not found or not v_m.is_active or v_m.expires_at is null or v_m.expires_at <= p_at then
    return query select 0, null::text;
    return;
  end if;
  v_local := p_at at time zone coalesce((select s.timezone from public.settings s where s.id = 1), 'UTC');
  select * into v_plan from public.membership_plans where id = v_m.plan_id;
  if found and v_plan.discount_pct > 0 then
    v_best := v_plan.discount_pct;
    v_title := v_plan.name || ' member';
  end if;
  select o.discount_pct, o.title into v_opct, v_otitle
    from public.member_offers o
   where o.is_active and o.kind = 'percent' and coalesce(o.discount_pct, 0) > 0
     and (o.plan_id is null or o.plan_id = v_m.plan_id)
     and (o.valid_from is null or v_local::date >= o.valid_from)
     and (o.valid_to is null or v_local::date <= o.valid_to)
     and (o.days is null or cardinality(o.days) = 0 or extract(dow from v_local)::int = any (o.days))
     and (o.start_time is null or o.end_time is null
          or (o.start_time <= o.end_time and v_local::time >= o.start_time and v_local::time < o.end_time)
          or (o.start_time > o.end_time and (v_local::time >= o.start_time or v_local::time < o.end_time)))
   order by o.discount_pct desc
   limit 1;
  if found and v_opct > v_best then
    v_best := v_opct;
    v_title := v_otitle;
  end if;
  return query select v_best, v_title;
end $$;

-- Internal: append to the activity log. Not callable from the browser.
create or replace function public.log_event(
  p_session uuid, p_kind text, p_minutes int default null, p_amount numeric default null,
  p_method text default null, p_detail text default null
) returns void language sql security definer set search_path = public as $$
  insert into public.session_events (session_id, kind, minutes, amount, method, detail, staff_name)
  values (p_session, p_kind, p_minutes, p_amount, p_method, p_detail, public.my_name());
$$;
revoke execute on function public.log_event(uuid, text, int, numeric, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
--  Session RPCs — all time & money maths happen on the server clock
-- ---------------------------------------------------------------------
drop function if exists public.start_session(uuid, text, text, text, text, int, int, text);
drop function if exists public.start_session(uuid, text, text, text, text, int, int, text, text);
create or replace function public.start_session(
  p_screen_id uuid,
  p_game_title text,
  p_team_code text default '0',
  p_customer_name text default null,
  p_customer_phone text default null,
  p_players int default 1,
  p_planned_minutes int default null,
  p_notes text default null,
  p_payment_method text default null,     -- set = customer pays for the booked time now
  p_member_id uuid default null            -- set = member session (discount applied by the server)
) returns public.sessions
language plpgsql security definer set search_path = public as $$
declare
  v_screen public.screens;
  v_settings public.settings;
  v_row public.sessions;
  v_no bigint;
  v_due numeric;
  v_member public.members;
  v_plan_name text;
  v_pct int := 0;
  v_offer text;
begin
  perform public.assert_staff();
  if coalesce(trim(p_game_title), '') = '' then raise exception 'Choose a game'; end if;
  if p_member_id is not null then
    select * into v_member from public.members where id = p_member_id;
    if not found or not v_member.is_active then raise exception 'Member not found'; end if;
    if v_member.expires_at is null or v_member.expires_at <= now() then
      raise exception 'Membership for % has expired. Renew it or start as a walk-in.', v_member.full_name;
    end if;
    select b.pct, b.title into v_pct, v_offer from public.member_benefit(p_member_id, now()) b;
    select name into v_plan_name from public.membership_plans where id = v_member.plan_id;
  end if;
  select * into v_screen from public.screens where id = p_screen_id and is_active;
  if not found then raise exception 'Screen not available'; end if;
  if exists (select 1 from public.sessions where screen_id = p_screen_id and status in ('active','paused')) then
    raise exception 'Screen % is already in use', v_screen.code;
  end if;
  select * into v_settings from public.settings where id = 1;
  if p_planned_minutes is null and not v_settings.allow_open_time then
    raise exception 'Open time is turned off. Choose how many hours to book.';
  end if;
  if p_planned_minutes is not null and (p_planned_minutes < 1 or p_planned_minutes > 1440) then
    raise exception 'Booked time must be between 1 minute and 24 hours';
  end if;
  if p_payment_method is not null and p_planned_minutes is null then
    raise exception 'Choose how many hours to book before taking payment';
  end if;
  v_no := nextval('public.receipt_seq');

  insert into public.sessions (
    receipt_no, receipt_code, team_code, customer_name, customer_phone, players,
    screen_id, screen_code, console, game_title, planned_minutes, hourly_rate, notes, staff_name,
    member_id, member_no, member_name, member_plan, member_expires_at, member_discount_pct, offer_title
  ) values (
    v_no, v_settings.receipt_prefix || v_no, coalesce(nullif(trim(p_team_code), ''), '0'),
    coalesce(nullif(trim(p_customer_name), ''), v_member.full_name),
    coalesce(nullif(trim(p_customer_phone), ''), v_member.phone), greatest(coalesce(p_players, 1), 1),
    v_screen.id, v_screen.code, v_screen.console, trim(p_game_title), p_planned_minutes,
    coalesce(v_screen.hourly_rate, v_settings.default_hourly_rate), nullif(trim(p_notes), ''), public.my_name(),
    v_member.id, v_member.member_no, v_member.full_name, v_plan_name, v_member.expires_at, coalesce(v_pct, 0), v_offer
  ) returning * into v_row;
  perform public.log_event(v_row.id, 'start', p_planned_minutes, null, null, 'Screen ' || v_row.screen_code);

  if p_payment_method is not null then
    v_due := public.member_net(public.booked_price(v_row.hourly_rate, p_planned_minutes), v_row.member_discount_pct);
    if v_due > 0 then
      update public.sessions set prepaid_amount = v_due, payment_method = p_payment_method
       where id = v_row.id returning * into v_row;
      perform public.log_event(v_row.id, 'payment', p_planned_minutes, v_due, p_payment_method, 'Paid upfront');
    end if;
  end if;
  return v_row;
end $$;

create or replace function public.pause_session(p_id uuid)
returns public.sessions language plpgsql security definer set search_path = public as $$
declare v_row public.sessions;
begin
  perform public.assert_staff();
  update public.sessions set status = 'paused', paused_at = now()
   where id = p_id and status = 'active' returning * into v_row;
  if not found then raise exception 'Session is not running'; end if;
  perform public.log_event(p_id, 'pause');
  return v_row;
end $$;

create or replace function public.resume_session(p_id uuid)
returns public.sessions language plpgsql security definer set search_path = public as $$
declare v_row public.sessions; v_secs int;
begin
  perform public.assert_staff();
  select floor(extract(epoch from (now() - paused_at)))::int into v_secs
    from public.sessions where id = p_id and status = 'paused';
  update public.sessions
     set status = 'active',
         paused_seconds = paused_seconds + v_secs,
         paused_at = null
   where id = p_id and status = 'paused' returning * into v_row;
  if not found then raise exception 'Session is not paused'; end if;
  perform public.log_event(p_id, 'resume', (v_secs / 60)::int);
  return v_row;
end $$;

-- Add time to a live session (the "+1 hour" button). Optionally collect
-- payment so everything booked so far is paid for.
drop function if exists public.extend_session(uuid, int);
create or replace function public.extend_session(p_id uuid, p_minutes int, p_payment_method text default null)
returns public.sessions language plpgsql security definer set search_path = public as $$
declare v_row public.sessions; v_due numeric;
begin
  perform public.assert_staff();
  if p_minutes is null or p_minutes < 1 or p_minutes > 720 then raise exception 'You can add between 1 minute and 12 hours'; end if;
  select * into v_row from public.sessions where id = p_id and status in ('active','paused') for update;
  if not found then raise exception 'Session is not live'; end if;

  update public.sessions
     set planned_minutes = coalesce(planned_minutes, public.played_minutes(v_row)) + p_minutes,
         extended_minutes = extended_minutes + p_minutes
   where id = p_id returning * into v_row;
  perform public.log_event(p_id, 'extend', p_minutes, null, null, null);

  if p_payment_method is not null then
    v_due := greatest(public.member_net(public.booked_price(v_row.hourly_rate, v_row.planned_minutes), v_row.member_discount_pct)
                      - v_row.prepaid_amount, 0);
    if v_due > 0 then
      update public.sessions set prepaid_amount = prepaid_amount + v_due, payment_method = p_payment_method
       where id = p_id returning * into v_row;
      perform public.log_event(p_id, 'payment', p_minutes, v_due, p_payment_method, 'Paid for added time');
    end if;
  end if;
  return v_row;
end $$;

create or replace function public.switch_screen(p_id uuid, p_screen_id uuid)
returns public.sessions language plpgsql security definer set search_path = public as $$
declare v_row public.sessions; v_screen public.screens; v_from text;
begin
  perform public.assert_staff();
  select * into v_screen from public.screens where id = p_screen_id and is_active;
  if not found then raise exception 'Screen not available'; end if;
  if exists (select 1 from public.sessions where screen_id = p_screen_id and status in ('active','paused')) then
    raise exception 'Screen % is already in use', v_screen.code;
  end if;
  select screen_code into v_from from public.sessions where id = p_id;
  update public.sessions
     set screen_id = v_screen.id, screen_code = v_screen.code
   where id = p_id and status in ('active','paused') returning * into v_row;
  if not found then raise exception 'Session is not live'; end if;
  perform public.log_event(p_id, 'move', null, null, null, v_from || ' → ' || v_screen.code);
  return v_row;
end $$;

create or replace function public.end_session(
  p_id uuid,
  p_payment_method text default 'cash',
  p_discount numeric default 0
) returns public.sessions
language plpgsql security definer set search_path = public as $$
declare
  v_row public.sessions;
  v_st public.settings;
  v_played int; v_billed int; v_gross numeric; v_mdisc numeric; v_net numeric; v_disc numeric; v_amount numeric; v_balance numeric;
  v_method text := coalesce(p_payment_method, 'cash');
begin
  perform public.assert_staff();
  select * into v_st from public.settings where id = 1;
  select * into v_row from public.sessions where id = p_id and status in ('active','paused') for update;
  if not found then raise exception 'Session is not live'; end if;

  -- close any open pause first
  if v_row.paused_at is not null then
    v_row.paused_seconds := v_row.paused_seconds + floor(extract(epoch from (now() - v_row.paused_at)))::int;
    v_row.paused_at := null;
  end if;
  v_row.ended_at := now();
  v_played := public.played_minutes(v_row, now());
  v_billed := public.billable_minutes(v_played);
  -- Shop rule: booked time is charged in full even if the customer leaves early
  if v_st.charge_booked_time and v_row.planned_minutes is not null then
    v_billed := greatest(v_billed, public.billable_minutes(v_row.planned_minutes));
  end if;
  v_gross := round(v_row.hourly_rate * v_billed / 60.0, 2);
  v_net := public.member_net(v_gross, v_row.member_discount_pct);   -- member discount first
  v_mdisc := v_gross - v_net;

  v_disc := least(greatest(coalesce(p_discount, 0), 0), v_net);
  if v_disc > 0 and not public.is_admin()
     and v_disc > round(v_net * v_st.staff_max_discount_pct / 100.0, 2) then
    if v_st.staff_max_discount_pct = 0 then
      raise exception 'Only an admin can give discounts';
    end if;
    raise exception 'Staff can give at most % percent discount. Ask an admin.', v_st.staff_max_discount_pct;
  end if;
  v_amount := v_net - v_disc;
  v_balance := v_amount - v_row.prepaid_amount;

  update public.sessions set
    status = 'completed', ended_at = v_row.ended_at, paused_at = null,
    paused_seconds = v_row.paused_seconds, played_minutes = v_played,
    billed_minutes = v_billed, gross_amount = v_gross,
    member_discount = v_mdisc, discount = v_disc, amount = v_amount,
    payment_method = case when v_balance <> 0 or v_row.payment_method is null then v_method else v_row.payment_method end,
    closed_by_name = public.my_name()
  where id = p_id returning * into v_row;

  perform public.log_event(p_id, 'end', v_played, null, null, null);
  if v_balance > 0 then
    perform public.log_event(p_id, 'payment', null, v_balance, v_method, 'Paid at checkout');
  elsif v_balance < 0 then
    perform public.log_event(p_id, 'refund', null, v_balance, v_method, 'Unused prepaid amount returned');
  end if;
  return v_row;
end $$;

create or replace function public.cancel_session(p_id uuid, p_reason text)
returns public.sessions language plpgsql security definer set search_path = public as $$
declare v_row public.sessions; v_st public.settings;
begin
  perform public.assert_staff();
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required to void a receipt'; end if;
  select * into v_row from public.sessions where id = p_id and status in ('active','paused') for update;
  if not found then raise exception 'Session is not live'; end if;
  select * into v_st from public.settings where id = 1;
  if not public.is_admin() then
    if v_st.staff_void_window_minutes = 0 then
      raise exception 'Only an admin can void receipts';
    elsif now() - v_row.started_at > make_interval(mins => v_st.staff_void_window_minutes) then
      raise exception 'Staff can only void within % minutes of the start. Ask an admin.', v_st.staff_void_window_minutes;
    end if;
  end if;

  update public.sessions
     set status = 'cancelled', ended_at = now(), paused_at = null, amount = 0,
         cancel_reason = trim(p_reason), closed_by_name = public.my_name()
   where id = p_id returning * into v_row;
  if v_row.prepaid_amount > 0 then
    perform public.log_event(p_id, 'refund', null, -v_row.prepaid_amount, v_row.payment_method, 'Prepaid amount returned');
  end if;
  perform public.log_event(p_id, 'void', null, null, null, trim(p_reason));
  return v_row;
end $$;

-- ---------------------------------------------------------------------
--  Membership RPCs
-- ---------------------------------------------------------------------
-- Internal: put a member on a plan (join or renew) and record the sale.
-- Renewing early adds the new period on top of the remaining time.
create or replace function public.apply_plan(p_member_id uuid, p_plan_id uuid, p_payment_method text, p_kind text)
returns public.membership_sales language plpgsql security definer set search_path = public as $$
declare
  v_m public.members; v_plan public.membership_plans; v_sale public.membership_sales;
  v_start timestamptz; v_end timestamptz;
begin
  select * into v_m from public.members where id = p_member_id for update;
  if not found then raise exception 'Member not found'; end if;
  select * into v_plan from public.membership_plans where id = p_plan_id and is_active;
  if not found then raise exception 'That plan is not available'; end if;
  if v_plan.price > 0 and p_payment_method is null then raise exception 'Choose how the member paid'; end if;

  v_start := greatest(now(), coalesce(v_m.expires_at, now()));
  v_end := v_start + make_interval(days => v_plan.duration_days);
  update public.members set plan_id = v_plan.id, expires_at = v_end, is_active = true where id = v_m.id;

  insert into public.membership_sales (member_id, plan_id, plan_name, kind, amount, method, period_start, period_end, staff_name)
  values (v_m.id, v_plan.id, v_plan.name, p_kind, v_plan.price, case when v_plan.price > 0 then p_payment_method end,
          v_start, v_end, public.my_name())
  returning * into v_sale;
  update public.membership_sales
     set receipt_code = (select receipt_prefix from public.settings where id = 1) || 'M' || lpad(v_sale.id::text, 5, '0')
   where id = v_sale.id returning * into v_sale;
  return v_sale;
end $$;
revoke execute on function public.apply_plan(uuid, uuid, text, text) from public, anon, authenticated;

create or replace function public.create_member(
  p_full_name text, p_phone text default null, p_plan_id uuid default null,
  p_payment_method text default null, p_notes text default null
) returns json language plpgsql security definer set search_path = public as $$
declare v_m public.members; v_sale public.membership_sales; v_digits text;
begin
  perform public.assert_staff();
  if coalesce(trim(p_full_name), '') = '' then raise exception 'Enter the member''s name'; end if;
  v_digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(v_digits) >= 9 and exists (
    select 1 from public.members
     where length(regexp_replace(phone, '\D', '', 'g')) >= 9
       and right(regexp_replace(phone, '\D', '', 'g'), 9) = right(v_digits, 9)
  ) then
    raise exception 'A member with phone % already exists', trim(p_phone);
  end if;

  insert into public.members (member_no, full_name, phone, notes, created_by_name)
  values ('M' || lpad(nextval('public.member_seq')::text, 4, '0'), trim(p_full_name),
          nullif(trim(p_phone), ''), nullif(trim(p_notes), ''), public.my_name())
  returning * into v_m;
  if p_plan_id is not null then
    v_sale := public.apply_plan(v_m.id, p_plan_id, p_payment_method, 'join');
    select * into v_m from public.members where id = v_m.id;
  end if;
  return json_build_object('member', row_to_json(v_m), 'sale', case when v_sale.id is null then null else row_to_json(v_sale) end);
end $$;

create or replace function public.renew_member(p_member_id uuid, p_plan_id uuid, p_payment_method text default null)
returns json language plpgsql security definer set search_path = public as $$
declare v_m public.members; v_sale public.membership_sales;
begin
  perform public.assert_staff();
  v_sale := public.apply_plan(p_member_id, p_plan_id, p_payment_method, 'renew');
  select * into v_m from public.members where id = p_member_id;
  return json_build_object('member', row_to_json(v_m), 'sale', row_to_json(v_sale));
end $$;

-- Admin corrections: change the expiry date, or deactivate / reactivate a member
create or replace function public.admin_update_member(p_id uuid, p_expires_at timestamptz, p_is_active boolean)
returns public.members language plpgsql security definer set search_path = public as $$
declare v_m public.members;
begin
  if not public.is_admin() then raise exception 'Only an admin can change this'; end if;
  update public.members set expires_at = p_expires_at, is_active = p_is_active where id = p_id returning * into v_m;
  if not found then raise exception 'Member not found'; end if;
  return v_m;
end $$;

-- Staff forgot to pick the member at the start (or a walk-in just joined):
-- link the member to the live session so the discount applies at checkout.
create or replace function public.attach_member(p_id uuid, p_member_id uuid)
returns public.sessions language plpgsql security definer set search_path = public as $$
declare v_row public.sessions; v_m public.members; v_pct int; v_offer text; v_plan text;
begin
  perform public.assert_staff();
  select * into v_row from public.sessions where id = p_id and status in ('active','paused') for update;
  if not found then raise exception 'Session is not live'; end if;
  if v_row.member_id is not null then raise exception 'This session already has a member'; end if;
  select * into v_m from public.members where id = p_member_id and is_active;
  if not found then raise exception 'Member not found'; end if;
  if v_m.expires_at is null or v_m.expires_at <= now() then
    raise exception 'Membership for % has expired. Renew it first.', v_m.full_name;
  end if;
  -- offers are judged at the session's start time, like any other session
  select b.pct, b.title into v_pct, v_offer from public.member_benefit(p_member_id, v_row.started_at) b;
  select name into v_plan from public.membership_plans where id = v_m.plan_id;
  update public.sessions
     set member_id = v_m.id, member_no = v_m.member_no, member_name = v_m.full_name, member_plan = v_plan,
         member_expires_at = v_m.expires_at, member_discount_pct = coalesce(v_pct, 0), offer_title = v_offer,
         customer_name = coalesce(customer_name, v_m.full_name), customer_phone = coalesce(customer_phone, v_m.phone)
   where id = p_id returning * into v_row;
  perform public.log_event(p_id, 'member', null, null, null, v_m.member_no || ' · ' || v_m.full_name);
  return v_row;
end $$;

-- ---------------------------------------------------------------------
--  Row Level Security
--  * Any signed-in staff member can read everything and run sessions.
--  * Only admins can change settings / screens / games / roles.
--  * Nobody can DELETE receipts (voiding keeps an audit trail).
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.screens  enable row level security;
alter table public.games    enable row level security;
alter table public.sessions enable row level security;

drop policy if exists "profiles read"  on public.profiles;
drop policy if exists "profiles admin" on public.profiles;
drop policy if exists "profiles self"  on public.profiles;
create policy "profiles read"  on public.profiles for select to authenticated using (id = auth.uid() or public.is_staff());
create policy "profiles admin" on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "profiles self"  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and role = (select p.role from public.profiles p where p.id = auth.uid()));

drop policy if exists "settings read"  on public.settings;
drop policy if exists "settings admin" on public.settings;
create policy "settings read"  on public.settings for select to authenticated using (public.is_staff());
create policy "settings admin" on public.settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "screens read"  on public.screens;
drop policy if exists "screens admin" on public.screens;
create policy "screens read"  on public.screens for select to authenticated using (public.is_staff());
create policy "screens admin" on public.screens for all    to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "games read"  on public.games;
drop policy if exists "games admin" on public.games;
create policy "games read"  on public.games for select to authenticated using (public.is_staff());
create policy "games admin" on public.games for all    to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "sessions read"   on public.sessions;
drop policy if exists "sessions insert" on public.sessions;
drop policy if exists "sessions update" on public.sessions;
create policy "sessions read"   on public.sessions for select to authenticated using (public.is_staff());
create policy "sessions update" on public.sessions for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- Receipts can only be created / timed / billed through the RPCs above
-- (security definer, server clock). Direct API writes are limited to
-- descriptive fields, so amounts and times cannot be edited from a browser.
revoke insert, update, delete on public.sessions from anon, authenticated;
grant update (customer_name, customer_phone, team_code, notes, players)
  on public.sessions to authenticated;

revoke all on sequence public.receipt_seq from anon, authenticated;

alter table public.session_events enable row level security;
drop policy if exists "events read" on public.session_events;
create policy "events read" on public.session_events for select to authenticated using (public.is_staff());
revoke insert, update, delete, truncate on public.session_events from anon, authenticated;

alter table public.membership_plans enable row level security;
alter table public.member_offers    enable row level security;
alter table public.members          enable row level security;
alter table public.membership_sales enable row level security;

drop policy if exists "plans read"  on public.membership_plans;
drop policy if exists "plans admin" on public.membership_plans;
create policy "plans read"  on public.membership_plans for select to authenticated using (public.is_staff());
create policy "plans admin" on public.membership_plans for all    to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "offers read"  on public.member_offers;
drop policy if exists "offers admin" on public.member_offers;
create policy "offers read"  on public.member_offers for select to authenticated using (public.is_staff());
create policy "offers admin" on public.member_offers for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- Members are created / renewed through the RPCs; staff may correct contact details
drop policy if exists "members read"   on public.members;
drop policy if exists "members update" on public.members;
create policy "members read"   on public.members for select to authenticated using (public.is_staff());
create policy "members update" on public.members for update to authenticated using (public.is_staff()) with check (public.is_staff());
revoke insert, update, delete, truncate on public.members from anon, authenticated;
grant update (full_name, phone, notes) on public.members to authenticated;
revoke all on sequence public.member_seq from anon, authenticated;

drop policy if exists "sales read" on public.membership_sales;
create policy "sales read" on public.membership_sales for select to authenticated using (public.is_staff());
revoke insert, update, delete, truncate on public.membership_sales from anon, authenticated;

-- ---------------------------------------------------------------------
--  One-time data migrations (each runs once, tracked by name)
-- ---------------------------------------------------------------------
create table if not exists public.schema_migrations (
  name        text primary key,
  applied_at  timestamptz not null default now()
);
alter table public.schema_migrations enable row level security;  -- no policies: invisible to the API

do $$
begin
  -- Darkroom charges per hour: move installs still on the old 30-min defaults to 1-hour blocks
  if not exists (select 1 from public.schema_migrations where name = '2026-11-20-hourly-billing') then
    update public.settings set billing_increment_minutes = 60, minimum_minutes = 60
     where id = 1 and billing_increment_minutes = 30 and minimum_minutes = 30;
    insert into public.schema_migrations (name) values ('2026-11-20-hourly-billing');
  end if;

  -- Give receipts created before the activity log existed a start / end / payment history
  if not exists (select 1 from public.schema_migrations where name = '2026-11-20-events-backfill') then
    insert into public.session_events (session_id, kind, minutes, detail, staff_name, created_at)
    select s.id, 'start', s.planned_minutes, 'Screen ' || s.screen_code, s.staff_name, s.started_at
      from public.sessions s
     where not exists (select 1 from public.session_events e where e.session_id = s.id);
    insert into public.session_events (session_id, kind, minutes, staff_name, created_at)
    select s.id, 'end', s.played_minutes, s.closed_by_name, s.ended_at
      from public.sessions s where s.status = 'completed'
       and not exists (select 1 from public.session_events e where e.session_id = s.id and e.kind = 'end');
    insert into public.session_events (session_id, kind, amount, method, detail, staff_name, created_at)
    select s.id, 'payment', s.amount, s.payment_method, 'Paid at checkout', s.closed_by_name, s.ended_at
      from public.sessions s where s.status = 'completed' and s.amount > 0
       and not exists (select 1 from public.session_events e where e.session_id = s.id and e.kind = 'payment');
    insert into public.session_events (session_id, kind, detail, staff_name, created_at)
    select s.id, 'void', s.cancel_reason, s.closed_by_name, s.ended_at
      from public.sessions s where s.status = 'cancelled'
       and not exists (select 1 from public.session_events e where e.session_id = s.id and e.kind = 'void');
    insert into public.schema_migrations (name) values ('2026-11-20-events-backfill');
  end if;

  -- Starter membership plans so receipts can advertise membership from day one.
  -- Edit or replace them in Settings → Membership.
  if not exists (select 1 from public.schema_migrations where name = '2026-11-21-starter-plans') then
    if not exists (select 1 from public.membership_plans) then
      insert into public.membership_plans (name, duration_days, price, discount_pct, description, sort_order) values
        ('Weekly',  7,  300, 10, null, 1),
        ('Monthly', 30, 1000, 20, null, 2);
    end if;
    insert into public.schema_migrations (name) values ('2026-11-21-starter-plans');
  end if;
end $$;

-- ---------------------------------------------------------------------
--  Realtime: every device sees screens start / stop instantly
-- ---------------------------------------------------------------------
do $$
begin
  begin alter publication supabase_realtime add table public.sessions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.screens;  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.settings; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.members;          exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.membership_plans; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.member_offers;    exception when duplicate_object then null; end;
end $$;

-- ---------------------------------------------------------------------
--  Version stamp: the app checks this on load and asks for this script
--  to be re-run when the database is older than the app.
--  Bump it whenever the app starts depending on a schema change.
-- ---------------------------------------------------------------------
create or replace function public.schema_version()
returns int language sql immutable as $$ select 3 $$;
grant execute on function public.schema_version() to anon, authenticated;

-- Make the API pick up new tables and functions straight away
notify pgrst, 'reload schema';
