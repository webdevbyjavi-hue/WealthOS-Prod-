-- =============================================================================
-- Migration: 20260414000003_add_purchase_date_to_assets
-- Description: Adds purchase metadata to the assets table so the backfill
--              service knows the correct start date for historical snapshots.
--              All columns are nullable — existing rows and queries are unaffected.
-- =============================================================================

BEGIN;

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS purchase_date DATE,
  ADD COLUMN IF NOT EXISTS quantity      NUMERIC(20, 8),
  ADD COLUMN IF NOT EXISTS avg_buy_price NUMERIC(20, 8);

-- Partial index for efficient "find assets that need backfill" queries.
CREATE INDEX IF NOT EXISTS idx_assets_purchase_date
  ON public.assets (purchase_date)
  WHERE purchase_date IS NOT NULL;

COMMENT ON COLUMN public.assets.purchase_date IS
  'Date the user first acquired this asset. NULL for assets added without purchase info. '
  'Used as start_date for historical snapshot backfill.';

COMMENT ON COLUMN public.assets.quantity IS
  'Denormalized position size. portfolio_assets.quantity is authoritative for portfolio math.';

COMMENT ON COLUMN public.assets.avg_buy_price IS
  'Denormalized average acquisition price. '
  'portfolio_assets.average_buy_price is authoritative for portfolio math.';

COMMIT;
