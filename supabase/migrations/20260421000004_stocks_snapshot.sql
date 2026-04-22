-- =============================================================================
-- Migration: 20260421000004_stocks_snapshot
-- Description: Replaces the per-user asset_snapshots model with a shared
--              (symbol, date) price store and a read-time portfolio value view.
--
-- Key design decisions:
--   • PRIMARY KEY (symbol, date) — one row per symbol globally, not per user.
--     Ten users holding AAPL produce one row per day, not ten.
--   • symbol format matches TwelveData: 'AAPL', 'BTC/USD', 'FUNO11.MX'
--   • No market_cap column — not returned by TwelveData free tier.
--   • NUMERIC(18,8) for all prices — handles crypto sub-cent values safely.
--   • RLS: authenticated users can SELECT (prices are not user-private data).
--     INSERT/UPDATE/DELETE is service-role only (backend worker bypasses RLS).
--   • portfolio_daily_value view computes total value at read time — no storage
--     duplication. Join cost is trivial at current scale.
-- =============================================================================

-- ─── stocks_snapshot ─────────────────────────────────────────────────────────
-- Global price store for stocks, fibras (REITs), and crypto.
-- One row per (symbol, date) — shared across all users.

CREATE TABLE IF NOT EXISTS public.stocks_snapshot (
  symbol  TEXT            NOT NULL,
  date    DATE            NOT NULL,
  open    NUMERIC(18, 8),
  high    NUMERIC(18, 8),
  low     NUMERIC(18, 8),
  close   NUMERIC(18, 8)  NOT NULL,
  volume  NUMERIC(18, 8),

  PRIMARY KEY (symbol, date)
);

-- The composite PRIMARY KEY index (symbol, date) serves all three access patterns:
--   • WHERE symbol = $1 AND date BETWEEN $2 AND $3  → chart queries, gap detection
--   • WHERE symbol = $1 ORDER BY date ASC/DESC       → trendline fetch
--   • WHERE date = $1                                → nightly job existence check
-- No additional indexes needed at current scale.

ALTER TABLE public.stocks_snapshot ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read (prices are public market data)
CREATE POLICY "prices_select_authenticated"
  ON public.stocks_snapshot FOR SELECT
  TO authenticated
  USING (true);

-- INSERT/UPDATE/DELETE is backend-only (service role bypasses RLS automatically)

-- ─── portfolio_daily_value (view) ─────────────────────────────────────────────
-- Derives each user's daily portfolio value at read time by joining their
-- holdings (shares × close price) against stocks_snapshot. No stored totals —
-- no risk of stale data, no per-user duplication.
--
-- Symbol mapping (holding table → stocks_snapshot symbol format):
--   stocks:  ticker       → 'AAPL'       (stored as-is)
--   fibras:  ticker||'.MX'→ 'FUNO11.MX'  (BMV exchange suffix)
--   crypto:  symbol||'/USD'→ 'BTC/USD'   (TwelveData pair format)

CREATE OR REPLACE VIEW public.portfolio_daily_value AS
SELECT
  u.user_id,
  p.date,
  SUM(u.shares * p.close)::NUMERIC(18, 4) AS total_value
FROM (
  SELECT user_id, ticker            AS symbol, shares::NUMERIC       AS shares
    FROM public.stocks
  UNION ALL
  SELECT user_id, ticker || '.MX'   AS symbol, certificados::NUMERIC AS shares
    FROM public.fibras
  UNION ALL
  SELECT user_id, symbol || '/USD'  AS symbol, amount::NUMERIC       AS shares
    FROM public.crypto
) u
JOIN public.stocks_snapshot p ON p.symbol = u.symbol
GROUP BY u.user_id, p.date;

-- ─── Seed: carry over data already stored in asset_snapshots ─────────────────
-- Normalizes symbol format (reit → .MX, crypto → /USD) so existing data
-- remains queryable under the new keying scheme.
-- ON CONFLICT DO NOTHING: idempotent — safe to re-run.

INSERT INTO public.stocks_snapshot (symbol, date, open, high, low, close, volume)
WITH normalized AS (
  SELECT
    CASE
      WHEN a.asset_type = 'reit'   THEN a.ticker || '.MX'
      WHEN a.asset_type = 'crypto' THEN a.ticker || '/USD'
      ELSE a.ticker
    END                     AS symbol,
    snap.date,
    snap.open,
    snap.high,
    snap.low,
    snap.close,
    snap.volume,
    snap.created_at
  FROM public.asset_snapshots snap
  JOIN public.assets a ON a.id = snap.asset_id
  WHERE snap.close IS NOT NULL
)
SELECT DISTINCT ON (symbol, date)
  symbol, date, open, high, low, close, volume
FROM normalized
ORDER BY symbol, date, created_at DESC
ON CONFLICT (symbol, date) DO NOTHING;
