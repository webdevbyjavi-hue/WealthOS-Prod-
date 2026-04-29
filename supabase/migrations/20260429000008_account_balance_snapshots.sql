-- =============================================================================
-- Migration: 20260429000008_account_balance_snapshots
-- Description: Stores daily balance snapshots per bank account.
--              Powers the Balance History line chart on the Accounts page.
--              One row per account per calendar day — idempotent via ON CONFLICT.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.account_balance_snapshots (
  id          UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID           NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id  UUID           NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  date        DATE           NOT NULL,
  balance     NUMERIC(20, 4) NOT NULL,
  balance_mxn NUMERIC(20, 4) NOT NULL,
  fx_rate     NUMERIC(20, 8) NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT now(),

  CONSTRAINT uq_acct_balance_snapshot UNIQUE (account_id, date)
);

-- Fast lookups: all snapshots for one account, or all accounts on one date
CREATE INDEX IF NOT EXISTS idx_acct_bal_snaps_account
  ON public.account_balance_snapshots (account_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_acct_bal_snaps_user_date
  ON public.account_balance_snapshots (user_id, date DESC);

-- ─── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE public.account_balance_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY acct_snap_select ON public.account_balance_snapshots
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY acct_snap_insert ON public.account_balance_snapshots
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY acct_snap_update ON public.account_balance_snapshots
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY acct_snap_delete ON public.account_balance_snapshots
  FOR DELETE USING (auth.uid() = user_id);
