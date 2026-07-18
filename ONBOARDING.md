# Divido — Onboarding / Session Handoff

A React + TypeScript + Vite bill-splitting app (like Splitwise), with a Supabase backend.

## Run it
- **Project folder:** `C:\Users\damin\OneDrive\Documents\divido-next`
- **Dev server:** `npm run dev` → `http://localhost:5173`
  - Port **5173 is required** (Google OAuth redirect). Don't change it.
- **Typecheck:** `npx tsc --noEmit -p tsconfig.app.json` (run this to catch errors; there are no unit tests for UI)
- The app sits behind a **Google sign-in** — an automated agent cannot get past the login screen, so verify UI changes by typechecking + asking the user to confirm visually.

## Stack & conventions
- **Styling:** inline CSS-in-JS everywhere (no CSS modules). Global styles in `src/index.css`.
- **Theme:** Home and Settle All pages use a warm cream canvas `#FAF4EC` with white cards; single **green accent** `#059669` / `#10B981`. Pills use pink `#D8608A` ("to pay") and green `#3FA97C` ("to collect").
- **Backend:** Supabase client in `src/lib/supabaseClient.ts`. Tables: `groups`, `expenses`, `group_members`, `notifications`.
- **Live FX rates:** `https://open.er-api.com/v6/latest/{CODE}` with an offline fallback table (used by the group + Settle All currency converters). Symbol→code via `worldCurrencies` in `src/lib/utils.ts`.

## Key files
- `src/App.tsx` — root: state, auth, Supabase sync, notifications state, most modals.
- `src/components/MasterSummary.tsx` — Home page (Net Balance split-pill card, group cards).
- `src/components/FriendsView.tsx` — Settle All page (friend cards, currency-convert modal).
- `src/components/MobileHeader.tsx` — shared frosted header (Home + Settle All): burger, title, search, bell.
- `src/components/GroupDetail.tsx` — inside-a-group view.
- `src/components/ExpenseModal.tsx` — add/edit expense card.
- `src/lib/notifications.ts` — notification fetch/push/subscribe helpers.
- `src/hooks/useSupabaseSync.ts` — reconciles local state ↔ Supabase.

## ⚠️ Pending Supabase SQL (features are built but won't persist until these run)
```sql
-- 1) Notifications bell (reminders, settlements, added-to-group, rename requests)
create table if not exists notifications (
  id bigint generated always as identity primary key,
  recipient_email text not null,
  type text not null,
  title text not null,
  body text,
  from_name text,
  from_email text,
  group_id bigint,
  amount numeric,
  currency text,
  is_read boolean default false,
  created_at timestamptz default now()
);
alter publication supabase_realtime add table notifications;

-- 2) Admin "rename member" accept/reject flow
alter table group_members add column if not exists pending_name text;

-- 3) Live detection when a friend joins a group
alter publication supabase_realtime add table group_members;

-- 4) Editable group "formed on" date (optional; falls back to created_at)
alter table groups add column if not exists created_date date;
```

## Built recently (this session)
- Frosted glass header that hides on scroll-down / reveals on scroll-up (Home + Settle All), with working search + notification bell.
- Notification system: reminders, payment/settlement, "you were added to a group", and admin-rename **accept/reject** (rename propagates through all historical expenses on accept).
- Home Net Balance card: pink/green split pill ("₹X to pay | £Y to collect"), smart one-sided/settled states, multi-currency `+N more`.
- Home group cards + Settle All friend cards redesigned: big avatar, name, stacked colored "to pay/to collect" text, right chevron (no Settle button).
- Settle All: live-rate **currency converter modal** (icon right of "All Balances") to simplify multiple currencies into one (display-only).
- Expense card cleanup: removed decorative emojis from labels ("Paid by / Split Mode / Paid For", all lightened to `#94A3B8`); replaced scan/notes/date/repeat emojis with grey line icons.

## Working style the user prefers
- Show visual options (mockups) and let them pick before building big UI changes.
- Keep it clean and mature — not "childish"; avoid loud colors/emoji clutter.
- Make small, iterative tweaks; they'll refine spacing/size/color by eye.

## Next up
<!-- Describe the next task here when starting the new session -->
