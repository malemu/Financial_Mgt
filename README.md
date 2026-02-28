# Financial Management System

Conviction OS is a Supabase-backed Next.js 16 application that tracks goals, allocations, holdings, historical market data, and Supabase Auth sessions for a small collaborator group.

## Stack

- **Next.js 16 (App Router)** – UI + API routes
- **Supabase Postgres** – canonical persistence and Auth
- **Alpha Vantage + Coinbase + FRED** – market data sources
- **TypeScript + React 19** – front-end/runtime language

## Prerequisites

1. **Supabase project** – grab the Project URL, anon key, and service role key.
2. **Alpha Vantage API key** – required for automatic price history updates (SPY/QQQ/IWM, etc.).
3. **Node.js 20+**

## Environment Variables

Create `.env.local` with the following variables (see `.env.example`):

```
NEXT_PUBLIC_SUPABASE_URL="https://<your-project>.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon-key>"
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
ALPHA_VANTAGE_API_KEY="<alpha-vantage-key>"
```

The service role key is only consumed by server-side code (API routes, scripts) via the cached Supabase admin client.

## Database Setup

1. **Apply the migration**: run the SQL in `supabase/migrations/20260228_init_financial_schema.sql` inside the Supabase SQL editor (or `psql`). This creates the public tables and disables RLS for the trusted environment.
2. **Seed from the strategic snapshot**:
   ```bash
   # ensure the env vars above are exported for the shell
   npm run seed:supabase
   ```
   The seed now loads:
   - Goals, allocations, holdings, net-worth history
   - Buy/Rent calculator inputs
   - Local market activity + market metrics
   - **Full historical `price_history`** for SPY/QQQ/IWM/VIX (from `strategic_snapshot/macro_price_history_by_ticker.json`).

With the seed complete, Supabase has >200 rows of SPY/QQQ/VIX history so regime calculations can run immediately.

## Running the App

```bash
npm install
npm run dev
```

Visit `http://localhost:3000`, log in with a Supabase Auth user (email/password), and use the dashboard.

## Price & Market Data Workflows

- **Update Price History** (UI button → `POST /api/price-history/update`)
  - Requires `ALPHA_VANTAGE_API_KEY` for stocks and uses Coinbase for BTC plus FRED for VIX.
  - Inserts new rows into `price_history` in Supabase and then recomputes market metrics.
  - If Alpha Vantage returns no data (rate limit, invalid key, etc.), the API responds with JSON describing the failure per ticker.
- **Upload Price History** (manual JSON/CSV)
  - Writes directly to `price_history` and then recomputes market metrics.
  - Body accepts an optional `"mode": "replace"` flag (default `"append"`). When set to `replace`, the API deletes the submitted ticker+dates before inserting, so you can correct bad data without touching other rows.

If you see “Price update failed”:
1. Ensure `ALPHA_VANTAGE_API_KEY` is defined for the environment (local + Vercel).
2. Confirm Supabase already contains seed history (`price_history` should have SPY/QQQ rows). Rerun `npm run seed:supabase` if needed.
3. Check the browser console → Network tab for the JSON payload, or run `curl /api/price-history/update` to inspect the server response.

## Deployment Checklist

1. Configure env vars in Vercel (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ALPHA_VANTAGE_API_KEY`).
2. Grant Vercel access to the private repo and Supabase project.
3. Ensure `npm run build` passes locally (it runs the same Supabase-backed API routes as production).

## Troubleshooting

| Issue | Fix |
| --- | --- |
| **Auth redirect loop** | Verify Supabase anon key/URL match the project and allowed redirect URLs include your domain. |
| **Price update fails immediately** | Missing `ALPHA_VANTAGE_API_KEY` or Supabase `price_history` table empty. Seed data and set the key. |
| **Upload succeeds but market metrics fail** | The automatic regime rebuild still requires ≥200 rows of SPY/QQQ/VIX; seed or backfill those tickers first. |
| **`npm run seed:supabase` errors** | Ensure the env vars are exported in the shell before running the script. |

---

For deeper architecture docs, see `docs/` or the inline comments inside the Supabase services.
