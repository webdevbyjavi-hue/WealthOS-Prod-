'use strict';

/**
 * snapshotService.js
 * ──────────────────
 * Fetches the latest daily price for every tracked asset and upserts a row
 * into asset_snapshots.  Designed to run once per day at market close.
 *
 * Behaviour:
 *   • Loads all assets from the database (via supabaseAdmin — bypasses RLS)
 *   • For each asset, fetches today's price from the price service
 *   • Upserts into asset_snapshots using the (asset_id, date) unique constraint
 *     → If the row doesn't exist it is inserted; if it exists it is updated
 *   • Processes assets sequentially to respect Alpha Vantage rate limits
 *     (free tier: 5 req/min)
 *   • Returns a structured result object with per-asset success/failure details
 *   • Never throws — errors are caught per asset so one failure can't abort the run
 *
 * Usage:
 *   const { runSnapshots } = require('./snapshotService');
 *   const result = await runSnapshots();
 */

const { supabaseAdmin } = require('./supabaseClient');
const { fetchPrice }    = require('./priceService');

// Alpha Vantage free tier: 5 requests/minute → ~12 s between calls is safe.
// Set to 0 in test/dev environments where a mock price service is used.
const RATE_LIMIT_DELAY_MS = parseInt(process.env.SNAPSHOT_RATE_DELAY_MS || '12000', 10);

/** Pause for `ms` milliseconds. */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Return today's date as a UTC DATE string (YYYY-MM-DD). */
function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Run the daily snapshot job.
 *
 * @returns {Promise<{
 *   date: string,
 *   total: number,
 *   succeeded: number,
 *   failed: number,
 *   results: Array<{ asset_id, ticker, status, date?, error? }>
 * }>}
 */
async function runSnapshots() {
  const runDate = todayUTC();
  console.log(`[snapshotService] Starting snapshot run for ${runDate}`);

  // ── 1. Load all assets (service role bypasses RLS so we get every user's assets)
  const { data: assets, error: fetchErr } = await supabaseAdmin
    .from('assets')
    .select('id, user_id, ticker, name, asset_type, currency')
    .order('created_at', { ascending: true });

  if (fetchErr) {
    throw new Error(`[snapshotService] Failed to load assets: ${fetchErr.message}`);
  }

  if (!assets || assets.length === 0) {
    console.log('[snapshotService] No assets found. Nothing to snapshot.');
    return { date: runDate, total: 0, succeeded: 0, failed: 0, results: [] };
  }

  console.log(`[snapshotService] Processing ${assets.length} asset(s)...`);

  const results = [];

  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];

    try {
      // ── 2. Fetch the latest price for this asset
      const price = await fetchPrice(asset);

      if (!price) {
        // Price service returned null (e.g. API key not configured)
        results.push({ asset_id: asset.id, ticker: asset.ticker, status: 'skipped', reason: 'no_api_key' });
        continue;
      }

      // ── 3. Upsert into asset_snapshots
      //    onConflict targets the (asset_id, date) unique constraint.
      //    If the row already exists, all price columns are updated.
      const snapshotDate = price.date || runDate;

      const { error: upsertErr } = await supabaseAdmin
        .from('asset_snapshots')
        .upsert(
          {
            asset_id:   asset.id,
            date:       snapshotDate,
            open:       price.open       ?? null,
            high:       price.high       ?? null,
            low:        price.low        ?? null,
            close:      price.close,
            volume:     price.volume     ?? null,
            market_cap: price.market_cap ?? null,
          },
          { onConflict: 'asset_id,date' }
        );

      if (upsertErr) throw upsertErr;

      console.log(`[snapshotService] ✓ ${asset.ticker} — close: ${price.close} (${snapshotDate})`);
      results.push({ asset_id: asset.id, ticker: asset.ticker, status: 'ok', date: snapshotDate });

    } catch (err) {
      const message = err?.message || String(err);
      console.error(`[snapshotService] ✗ ${asset.ticker} — ${message}`);
      results.push({ asset_id: asset.id, ticker: asset.ticker, status: 'error', error: message });
    }

    // Rate-limit delay between API calls (skip after the last asset)
    if (i < assets.length - 1 && RATE_LIMIT_DELAY_MS > 0) {
      await sleep(RATE_LIMIT_DELAY_MS);
    }
  }

  const succeeded = results.filter((r) => r.status === 'ok').length;
  const failed    = results.filter((r) => r.status === 'error').length;
  const skipped   = results.filter((r) => r.status === 'skipped').length;

  console.log(
    `[snapshotService] Run complete — ` +
    `${succeeded} succeeded, ${failed} failed, ${skipped} skipped out of ${assets.length} total.`
  );

  return {
    date:      runDate,
    total:     assets.length,
    succeeded,
    failed,
    results,
  };
}

module.exports = { runSnapshots };
