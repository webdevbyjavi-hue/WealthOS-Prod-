'use strict';

/**
 * accountSnapshotService.js
 * ─────────────────────────
 * Snapshots every user's account balances for today's date.
 * Called by the midnight cron in server.js and by the manual trigger
 * endpoint POST /api/accounts/snapshots (per-user, request-scoped).
 *
 * Idempotent — upserts on (account_id, date), safe to re-run.
 */

const { supabaseAdmin } = require('./supabaseClient');

function _todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Snapshot all accounts for all users (used by cron).
 * Uses supabaseAdmin to bypass RLS and read every user's accounts.
 */
async function snapshotAllAccounts() {
  const date = _todayUTC();
  console.log(`[accountSnapshotService] Starting daily snapshot for ${date}`);

  const { data: accounts, error } = await supabaseAdmin
    .from('accounts')
    .select('id, user_id, balance, fx_rate');

  if (error) throw new Error(`[accountSnapshotService] Failed to load accounts: ${error.message}`);
  if (!accounts?.length) {
    console.log('[accountSnapshotService] No accounts found — nothing to snapshot.');
    return { count: 0, date };
  }

  const rows = accounts.map(a => ({
    user_id:     a.user_id,
    account_id:  a.id,
    date,
    balance:     parseFloat(a.balance)   || 0,
    balance_mxn: (parseFloat(a.balance) || 0) * (parseFloat(a.fx_rate) || 1),
    fx_rate:     parseFloat(a.fx_rate)   || 1,
  }));

  const { error: upsertErr } = await supabaseAdmin
    .from('account_balance_snapshots')
    .upsert(rows, { onConflict: 'account_id,date' });

  if (upsertErr) throw new Error(`[accountSnapshotService] Upsert failed: ${upsertErr.message}`);

  console.log(`[accountSnapshotService] Snapped ${rows.length} account(s) for ${date}`);
  return { count: rows.length, date };
}

module.exports = { snapshotAllAccounts };
