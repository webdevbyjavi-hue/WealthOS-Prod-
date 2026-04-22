'use strict';

/**
 * snapshotService.js
 * ──────────────────
 * Daily price snapshot job. Collects every distinct symbol tracked by any
 * user, fetches the latest completed trading session via Twelve Data /quote
 * (batched to minimise API credits), and upserts into stocks_snapshot.
 *
 * Key design:
 *   • Reads distinct (ticker, asset_type) from the assets registry — one
 *     symbol appears once regardless of how many users hold it.
 *   • Uses fetchBatchQuote() — one HTTP request per batch of symbols.
 *     With 8 credits/minute and batch size 8, 80 symbols = 10 HTTP requests.
 *   • All API calls go through requestQueue.js as HIGH priority so the
 *     nightly job always takes precedence over background backfills.
 *   • Writes to stocks_snapshot with ON CONFLICT DO NOTHING — idempotent.
 *   • Never throws — per-batch errors are caught, logged, and reported.
 *
 * Called by:
 *   • The node-cron job in server.js at 23:00 UTC Mon–Fri (after all major
 *     markets have closed, so /quote returns that day's completed session).
 *   • The manual trigger endpoint POST /api/snapshots/run.
 */

const { supabaseAdmin }                          = require('./supabaseClient');
const { fetchBatchQuote, normalizeSymbol }       = require('./priceService');
const { enqueue }                                = require('./requestQueue');

const BATCH_SIZE = parseInt(process.env.SNAPSHOT_BATCH_SIZE || '8', 10);

function _todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Run the daily snapshot job.
 *
 * @returns {Promise<{
 *   date:      string,
 *   total:     number,
 *   succeeded: number,
 *   failed:    number,
 *   results:   Array<{ symbol, status, date?, error?, reason? }>
 * }>}
 */
async function runSnapshots() {
  const runDate = _todayUTC();
  console.log(`[snapshotService] Starting snapshot run for ${runDate}`);

  // ── 1. Load all (ticker, asset_type) pairs from the assets registry ──────────
  //    supabaseAdmin bypasses RLS so we get every user's assets in one query.
  const { data: assetRows, error: fetchErr } = await supabaseAdmin
    .from('assets')
    .select('ticker, asset_type')
    .order('ticker');

  if (fetchErr) {
    throw new Error(`[snapshotService] Failed to load assets: ${fetchErr.message}`);
  }

  if (!assetRows || assetRows.length === 0) {
    console.log('[snapshotService] No assets found. Nothing to snapshot.');
    return { date: runDate, total: 0, succeeded: 0, failed: 0, results: [] };
  }

  // ── 2. Deduplicate: one entry per TwelveData-formatted symbol ─────────────────
  //    Multiple users holding AAPL → one 'AAPL' entry. BTC → 'BTC/USD'.
  const symbolMap = new Map(); // tdSymbol → (unused, just for dedup)
  for (const row of assetRows) {
    const tdSym = normalizeSymbol(row.ticker, row.asset_type);
    if (!symbolMap.has(tdSym)) symbolMap.set(tdSym, row.asset_type);
  }

  const symbols = [...symbolMap.keys()];
  console.log(`[snapshotService] Fetching ${symbols.length} unique symbol(s)...`);

  const results = [];

  // ── 3. Batch /quote requests (HIGH priority — nightly job first in queue) ─────
  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE);

    let quoteMap;
    try {
      quoteMap = await enqueue(
        () => fetchBatchQuote(batch),
        { priority: 'high', creditCost: batch.length }
      );
    } catch (err) {
      console.error(`[snapshotService] Batch failed: ${err.message}`);
      for (const sym of batch) {
        results.push({ symbol: sym, status: 'error', error: err.message });
      }
      continue;
    }

    // ── 4. Collect rows and upsert ───────────────────────────────────────────
    const rows = [];
    for (const sym of batch) {
      const quote = quoteMap.get(sym);
      if (!quote) {
        console.warn(`[snapshotService] ✗ ${sym} — no data returned`);
        results.push({ symbol: sym, status: 'skipped', reason: 'no_data' });
        continue;
      }
      rows.push({
        symbol: sym,
        date:   quote.date,
        open:   quote.open   ?? null,
        high:   quote.high   ?? null,
        low:    quote.low    ?? null,
        close:  quote.close,
        volume: quote.volume ?? null,
      });
      console.log(`[snapshotService] ✓ ${sym} — close: ${quote.close} (${quote.date})`);
      results.push({ symbol: sym, status: 'ok', date: quote.date });
    }

    if (rows.length > 0) {
      const { error: upsertErr } = await supabaseAdmin
        .from('stocks_snapshot')
        .upsert(rows, { onConflict: 'symbol,date' });

      if (upsertErr) {
        console.error(`[snapshotService] Upsert error: ${upsertErr.message}`);
        for (const row of rows) {
          const r = results.find((x) => x.symbol === row.symbol && x.status === 'ok');
          if (r) { r.status = 'error'; r.error = upsertErr.message; delete r.date; }
        }
      }
    }
  }

  const succeeded = results.filter((r) => r.status === 'ok').length;
  const failed    = results.filter((r) => r.status === 'error').length;

  console.log(
    `[snapshotService] Run complete — ${succeeded} succeeded, ${failed} failed ` +
    `out of ${symbols.length} unique symbol(s).`
  );

  return { date: runDate, total: symbols.length, succeeded, failed, results };
}

module.exports = { runSnapshots };
