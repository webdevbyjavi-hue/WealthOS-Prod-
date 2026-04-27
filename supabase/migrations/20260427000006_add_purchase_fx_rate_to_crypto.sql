-- =============================================================================
-- Migration: 20260427000006_add_purchase_fx_rate_to_crypto
-- Description: Adds purchase_fx_rate to the crypto table so each position
--              records the USD/MXN rate in effect on the purchase date, enabling
--              accurate historical MXN cost-basis calculations.
-- =============================================================================

ALTER TABLE public.crypto
  ADD COLUMN IF NOT EXISTS purchase_fx_rate NUMERIC(12,6);
