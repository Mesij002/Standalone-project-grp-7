# SpendWise: Personal Expense Tracker & Budget Visualizer

Log income and expenses, see your balance at a glance, track spending by category, set monthly budgets and savings goals.

## Features
- Transaction form (income / expense) with HTML5 validation
- Live counters: total income, total expenses, current balance
- Spending-by-category progress bars (share of total expenses, follows the month filter)
- Filter by category, month and search text, with a filtered income / expenses / net summary and a "Clear filters" button
- Monthly category budgets with warning (80%) and over-budget (100%) bars
- Multiple savings goals; allocated money is deducted from the available balance
- Sign up / log in / log out and password reset (Supabase Auth)

## Tech
HTML5, CSS (custom progress bars + Tailwind CDN utilities), vanilla JavaScript, LocalStorage, Supabase (auth + transactions table).

## How data is stored
| Data | Where |
|---|---|
| Transactions | Supabase `transactions` table, with a per-user copy cached in LocalStorage (shows instantly, used if the server is unreachable) |
| Savings goals | LocalStorage, per user |
| Monthly budgets | LocalStorage, per user |

All LocalStorage keys end with the user's id, so two accounts on one browser never share data.

## Setup
1. Create a Supabase project and put its URL and publishable key in `supabase-config.js`.
2. Run `supabase-setup.sql` in the Supabase SQL editor (creates tables, Row Level Security and the profile trigger).
3. In Supabase > Authentication > URL Configuration, add your deployed site URL as a redirect URL.
4. Open `index.html` with a static server (e.g. VS Code Live Server) or deploy to Netlify / GitHub Pages / Vercel.

## Balance rule
Current balance = total income - total expenses - money allocated to savings goals.

## Known limitations
- Savings goals and budgets live in the browser only (not synced across devices).
- Password reset emails redirect to the sign-in page; a dedicated "set new password" page is not built yet.
