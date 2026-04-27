-- =============================================================================
-- Migration: 20260427000007_portfolio_value_snapshots
-- Description: Persists each user's total portfolio value (stocks + fibras +
--              crypto) in both USD and MXN at the end of every trading day.
--              Written by the nightly snapshot job; queried by the portfolio
--              history chart.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.portfolio_value_snapshots (
  user_id   UUID           NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date      DATE           NOT NULL,
  value_usd NUMERIC(18, 4) NOT NULL,
  value_mxn NUMERIC(18, 4) NOT NULL,
  fx_rate   NUMERIC(12, 6) NOT NULL,

  PRIMARY KEY (user_id, date)
);

ALTER TABLE public.portfolio_value_snapshots ENABLE ROW LEVEL SECURITY;

-- Users can only read their own rows
CREATE POLICY "portfolio_snapshots_select_own"
  ON public.portfolio_value_snapshots FOR SELECT
  USING (user_id = auth.uid());

-- INSERT / UPDATE / DELETE is backend-only (service role bypasses RLS)
