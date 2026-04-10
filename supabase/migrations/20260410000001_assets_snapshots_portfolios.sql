-- =============================================================================
-- Migration: 20260410000001_assets_snapshots_portfolios
-- Description: Creates the time-series financial data schema for WealthOS —
--              assets master list, daily OHLCV snapshots, portfolios, and the
--              portfolio_assets join table.
--
-- Best practices applied:
--   • NUMERIC(20, 8) for all financial values (no floating-point errors)
--   • DATE for snapshot dates, TIMESTAMPTZ for all timestamps (UTC)
--   • Unique constraint on (asset_id, date) to prevent duplicate daily rows
--   • Composite index on (asset_id, date) for fast time-range queries
--   • Row Level Security (RLS) on every table
--   • RLS policies scoped to auth.uid() so users never see each other's data
--   • Service-role writes to asset_snapshots bypass RLS (server-side only)
-- =============================================================================

-- ─── assets ──────────────────────────────────────────────────────────────────
-- Master list of financial assets tracked by a user.
-- ticker is not globally unique — two users may track the same ticker independently.

CREATE TABLE IF NOT EXISTS public.assets (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker     TEXT        NOT NULL,
  name       TEXT        NOT NULL,
  asset_type TEXT        NOT NULL CHECK (asset_type IN ('stock','crypto','etf','bond','reit','fund','other')),
  currency   TEXT        NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One user cannot track the same ticker twice
CREATE UNIQUE INDEX IF NOT EXISTS uq_assets_user_ticker
  ON public.assets (user_id, ticker);

-- ─── asset_snapshots ─────────────────────────────────────────────────────────
-- One row per asset per calendar day. Stores OHLCV plus optional market cap.
-- close is required; open/high/low/volume/market_cap are optional to support
-- assets where only a close price is available (e.g. mutual funds, some crypto).

CREATE TABLE IF NOT EXISTS public.asset_snapshots (
  id         UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id   UUID           NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  date       DATE           NOT NULL,
  open       NUMERIC(20, 8),
  high       NUMERIC(20, 8),
  low        NUMERIC(20, 8),
  close      NUMERIC(20, 8) NOT NULL,
  volume     NUMERIC(20, 8),
  market_cap NUMERIC(20, 8),
  created_at TIMESTAMPTZ    NOT NULL DEFAULT now(),

  -- Enforce exactly one snapshot per asset per day
  CONSTRAINT uq_asset_snapshot UNIQUE (asset_id, date)
);

-- Fast lookup of all snapshots for a single asset (used by history endpoints)
CREATE INDEX IF NOT EXISTS idx_asset_snapshots_asset_id
  ON public.asset_snapshots (asset_id);

-- Fast lookup by date (used for "all assets on day X" portfolio calculations)
CREATE INDEX IF NOT EXISTS idx_asset_snapshots_date
  ON public.asset_snapshots (date);

-- Composite index: fastest path for single-asset date-range queries
CREATE INDEX IF NOT EXISTS idx_asset_snapshots_asset_date
  ON public.asset_snapshots (asset_id, date);

-- ─── portfolios ───────────────────────────────────────────────────────────────
-- Optional grouping layer — a user can organise assets into named portfolios.

CREATE TABLE IF NOT EXISTS public.portfolios (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── portfolio_assets ─────────────────────────────────────────────────────────
-- Join table linking portfolios to assets with position metadata.
-- quantity and average_buy_price are stored here, not on the asset itself,
-- because the same asset can appear in multiple portfolios with different sizes.

CREATE TABLE IF NOT EXISTS public.portfolio_assets (
  id                UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id      UUID           NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  asset_id          UUID           NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  quantity          NUMERIC(20, 8) NOT NULL DEFAULT 0,
  average_buy_price NUMERIC(20, 8),
  added_at          TIMESTAMPTZ    NOT NULL DEFAULT now(),

  -- An asset can only appear once per portfolio
  CONSTRAINT uq_portfolio_asset UNIQUE (portfolio_id, asset_id)
);

-- ─── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE public.assets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolios      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_assets ENABLE ROW LEVEL SECURITY;

-- assets: full CRUD restricted to the owning user
CREATE POLICY "users manage own assets"
  ON public.assets FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- asset_snapshots: users can SELECT snapshots for assets they own.
-- INSERT/UPDATE/DELETE is done server-side via the service-role key (bypasses RLS).
CREATE POLICY "users read own snapshots"
  ON public.asset_snapshots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.assets
      WHERE id = asset_snapshots.asset_id
        AND user_id = auth.uid()
    )
  );

-- portfolios: full CRUD restricted to the owning user
CREATE POLICY "users manage own portfolios"
  ON public.portfolios FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- portfolio_assets: inherit access from the parent portfolio's user_id
CREATE POLICY "users manage own portfolio assets"
  ON public.portfolio_assets FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.portfolios
      WHERE id = portfolio_assets.portfolio_id
        AND user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.portfolios
      WHERE id = portfolio_assets.portfolio_id
        AND user_id = auth.uid()
    )
  );
