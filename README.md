# Darkroom Arcade

Session timing, receipts and daily reports for **Darkroom Arcade**, a PS5 gaming lounge.
Built with Next.js 16, Tailwind CSS 4 and Supabase. It's an installable app (PWA) for desktop, Android and iPhone.

## What it does

| Area | Features |
|---|---|
| **Floor** | A live card for each screen (A, B, C…) with a countdown ring, the start and **end time**, and what's paid or still due. Cards turn amber in the last minutes and flash red when time is up, with an alarm and a desktop notification. |
| **Add time** | Tap **+1h** on a live card when a customer wants to keep playing. It's the same receipt with no restart. Choose +1, +2 or +3 hours, optionally collect payment for the added time, and print an updated ticket with the new end time. Also on the card's menu: pause/resume, move to another screen, reprint, void. |
| **Start** | Choose **Walk-in** or **Member** (search by name, phone or member number, or sign them up on the spot). Pick a game and hours (1–5 h, or open time if allowed). The sheet shows the end time and the member price, and can collect payment upfront. Players, name and team code are tucked under "More details". |
| **Members** | Sign up regulars in seconds: name, phone and plan. Each gets a member number (M0001) and a printed membership receipt with a barcode. Search, filter by active, expiring or expired, renew with one tap (renewing early adds to the days left), and see visits, hours played, spending and savings. Admins can correct the expiry date or deactivate a member. |
| **Check-out** | Scan the receipt barcode with a USB or Bluetooth scanner, or type the receipt ID, and the bill opens. It shows what's already been paid and the balance due (or a refund). Choose Cash, M-Pesa, Card or Other, apply a discount, then charge and print. |
| **Receipts** | The printing animation shows a thermal printer feeding out the receipt. Tickets show the **Start Time** and **Ends At** in a box, the booked hours (including any added), and whether it's paid. Final receipts show the start, booked-until and end times, the charge, and what was paid upfront and at exit. Each print has a customer copy and a shop copy with a scannable Code 128 barcode. Receipt numbers continue the paper ones (`DKR15519`, …). |
| **Receipts page** | Browse receipts by day or search all history by receipt ID, game, customer, phone or team. Each receipt has an **activity log**: start, pauses, added hours, moves, payments, refunds and voids, each with the time and the staff member. Reprint, add notes, or export to CSV. |
| **Daily report** | Takings, session count, play time, average session, average ticket and busiest hour. Also: sessions started per hour, a 7-day trend, a timeline of every screen across the day, totals by screen and by game, and cash-up by payment method and by staff member. Cash-up counts the money actually received that day: upfront payments, payments for added time, checkout balances and refunds. Print an end-of-day **Z-report** on the thermal printer or export it to CSV. |
| **Settings** | Shop details and receipt text (with a live preview), rates and billing rules, booking and payment rules, staff limits, **membership plans and offers**, screens (each can have its own rate), the game list, team approvals, and per-device printer/sound/notification preferences. |

### Billing rules (admins: Settings → Pricing)
Games are charged **per hour**. There is no per-game or per-match pricing: FC 27 costs the same per hour as GTA V. Every rule below is stored in the Supabase `settings` table and changed from the app.

| Rule | Default | What it does |
|---|---|---|
| Rate per hour | KES 200 | Each screen can override it (e.g. a VIP screen). |
| Charge per | Hour | Can be changed to half hour, 15 min or per minute. |
| Minimum charge | 1 h | Applies even if the customer plays less than this. |
| Grace period | 5 min | Running over by up to 5 min doesn't start a new hour. |
| Allow open time | On | Off = staff must book hours. |
| Charge booked hours in full | On | Book 2 h, leave after 1 h 20 m → pay for 2 h. |
| Pay upfront by default | On | "Collect payment now" starts switched on. |
| Max staff discount | 100 % | 0 = only admins can give discounts. |
| Staff void window | 15 min | Staff can void only this soon after the start. 0 = admins only. |

Examples at KES 200/hr: book 1 h and play 1 h 4 m → KES 200. Book 1 h and play 1 h 7 m → 2 h → KES 400. If the customer prepaid 1 h, KES 200 is due at checkout.
Paused time is never billed. The final amount is always worked out **on the server, using the server's clock**, so changing a tablet's clock can't change a bill. Staff limits are enforced there too.

### Membership (admins: Settings → Membership)
- **Plans** set how long a membership lasts, its price and the member discount on every hour. Two starter plans are created that you can edit or delete: Weekly (KES 300, 10% off) and Monthly (KES 1,000, 20% off).
- **Offers** are either a discount % limited to certain days, times, dates or plans (e.g. *Happy hour: 30% off, Mon–Fri 10:00–14:00*), or a **perk**, which is text only (e.g. *Free soda on Fridays*).
- A member always gets the single best discount: their plan's or a matching offer's. They don't add up. The offer is judged at the moment the session starts, in the shop's timezone (default Africa/Nairobi).
- **Receipts**: member receipts show the member number, plan, expiry date and how much they saved. Walk-in receipts get a "Become a member" box listing your plans, perks and what they would have saved today. You can switch that box off.
- If staff forget to pick the member at the start, or a walk-in joins mid-game, use **Link a member** in the screen's ⋯ menu. The member price applies at checkout.
- Membership fees are counted in the day's cash-up and Z-report, which also show members vs walk-ins.

### Security
- Staff sign in with email and password. The **first account becomes the admin**. Every account after that stays *pending* and can't see anything until an admin approves it in **Settings → Team**.
- Receipts can't be deleted or edited where it matters: start and end times and amounts can only be set by the timer. A voided receipt keeps its reason and who voided it.

## Setup

1. **Database**: in Supabase go to **SQL Editor → New query**, paste [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. It's safe to run again. **Run it again after every update**: it upgrades existing data in place (new columns, the activity log, and a one-time switch from the old 30-min defaults to per-hour billing) without touching your receipts.
2. **Environment**: copy `.env.example` to `.env.local`. `.env.local` is already set up for this project.
3. **Run**
   ```bash
   npm install
   npm run dev        # http://localhost:3000
   ```
4. Open the app, choose **Create account**, and confirm your email. You are now the admin.
5. In **Settings**, set your rate, currency, screens, games and receipt text.

> **Supabase Auth URLs**: in Authentication → URL Configuration, set **Site URL** to the address where you deploy the app and add `https://<your-domain>/auth/callback` to the redirect URLs. Email confirmation links depend on this.

### Deploying
Deploy to Vercel or any Node host. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_SITE_URL`.
The app needs HTTPS before it can be installed as an app.

### Receipt printers
The app prints through the browser print dialog, so it works with any 58 mm or 80 mm thermal printer that has a driver installed.
Set the paper size on each device in **Settings → This device**. In the print dialog, choose your printer, set Margins to **None** and turn off headers and footers. Chrome remembers these settings.
To skip the print dialog completely, start Chrome with `--kiosk-printing`.

### Installing the app
- **Desktop (Chrome or Edge)**: click **Install app** in the sidebar, or the install icon in the address bar.
- **Android**: browser menu → *Install app*.
- **iPhone or iPad**: Share → *Add to Home Screen*.

## Brand assets
The logo was traced into vector paths from `public/logo.jpeg`. Everything else is generated from those paths:

```bash
node scripts/trace-logo.mjs      # only if the source logo changes
node scripts/generate-icons.mjs  # favicon.ico, PWA + maskable icons, apple-icon, OG image, mono receipt logo
```

## Project map
```
src/app/(app)/        Floor, receipts, reports, settings (signed-in area)
src/app/login/        Sign in / create account
src/components/       Arcade data provider (realtime), screen cards, sheets, receipt + printer animation, charts
src/lib/              Billing maths (mirrors SQL), Code 128 encoder, report aggregation, sounds
src/proxy.ts          Refreshes the auth session and redirects signed-out users to /login
supabase/schema.sql   Tables, RLS, roles, server-side session RPCs, activity log, migrations, realtime
public/sw.js          Service worker (offline shell, installability)
```
