-- =============================================================================
-- Migration: 20260422000005_add_purchase_date_to_holdings
-- Description: Adds purchase_date to stocks, fibras, and crypto tables so the
--              backend can persist it and trigger historical price backfills.
-- =============================================================================

ALTER TABLE public.stocks
  ADD COLUMN IF NOT EXISTS purchase_date DATE;

ALTER TABLE public.fibras
  ADD COLUMN IF NOT EXISTS purchase_date DATE;

ALTER TABLE public.crypto
  ADD COLUMN IF NOT EXISTS purchase_date DATE;
