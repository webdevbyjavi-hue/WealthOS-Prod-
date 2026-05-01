'use strict';

/**
 * snapshotService.js
 * ──────────────────
 * Daily price snapshot job. Collects every distinct symbol tracked by any
 * user, fetches the latest completed trading session via Twelve Data /quote
 * (batched to minimise API credits), and upserts into stocks_snapshot.
 *
 * Key design:
 *   • Reads distinct symbols directly from stocks, fibras, and crypto tables —
 *     one symbol appears once regardless of how many users hold it. This mirrors
 *     the portfolio_daily_value VIEW and requires no intermediate assets registry.
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

const { supabaseAdmin }                                               = require('./supabaseClient');
const { fetchBatchQuote, fetchHistoricalTimeSeries, normalizeSymbol } = require('./priceService');
const { enqueue }                                                     = require('./requestQueue');

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

  // ── 1. Collect all held symbols directly from the three holdings tables ────────
  //    This mirrors the portfolio_daily_value VIEW and removes any dependency on
  //    the assets registry being populated. supabaseAdmin bypasses RLS so we
  //    see every user's holdings in one set of queries.
  const [stocksRes, fibrasRes, cryptoRes] = await Promise.all([
    supabaseAdmin.from('stocks').select('ticker'),
    supabaseAdmin.from('fibras').select('ticker'),
    supabaseAdmin.from('crypto').select('symbol'),
  ]);

  if (stocksRes.error) throw new Error(`[snapshotService] Failed to load stocks: ${stocksRes.error.message}`);
  if (fibrasRes.error) throw new Error(`[snapshotService] Failed to load fibras: ${fibrasRes.error.message}`);
  if (cryptoRes.error) throw new Error(`[snapshotService] Failed to load crypto: ${cryptoRes.error.message}`);

  // ── 2. Deduplicate: one TwelveData-formatted symbol per holding type ──────────
  //    Multiple users holding AAPL → one 'AAPL' entry. BTC → 'BTC/USD'.
  //    Symbol format matches portfolio_daily_value VIEW:
  //      stocks:  ticker          → 'AAPL'
  //      fibras:  ticker + '.MX'  → 'FUNO11.MX'
  //      crypto:  symbol + '/USD' → 'BTC/USD'
  const symbolMap = new Map();
  for (const row of (stocksRes.data || [])) {
    const tdSym = normalizeSymbol(row.ticker, 'stock');
    if (!symbolMap.has(tdSym)) symbolMap.set(tdSym, 'stock');
  }
  for (const row of (fibrasRes.data || [])) {
    const tdSym = normalizeSymbol(row.ticker, 'reit');
    if (!symbolMap.has(tdSym)) symbolMap.set(tdSym, 'reit');
  }
  for (const row of (cryptoRes.data || [])) {
    const tdSym = normalizeSymbol(row.symbol, 'crypto');
    if (!symbolMap.has(tdSym)) symbolMap.set(tdSym, 'crypto');
  }

  if (symbolMap.size === 0) {
    console.log('[snapshotService] No holdings found across stocks, fibras, or crypto. Nothing to snapshot.');
    return { date: runDate, total: 0, succeeded: 0, failed: 0, results: [] };
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

  // ── 4. Persist per-user portfolio values in MXN ───────────────────────────
  if (succeeded > 0) {
    await savePortfolioSnapshots(runDate).catch((err) =>
      console.error('[snapshotService] Portfolio snapshot failed:', err.message)
    );
  }

  return { date: runDate, total: symbols.length, succeeded, failed, results };
}

/**
 * Compute each user's total portfolio value (stocks + fibras + crypto) for
 * `date`, apply that day's USD/MXN rate, and upsert into
 * portfolio_value_snapshots. Idempotent — safe to re-run for the same date.
 *
 * @param {string} date — YYYY-MM-DD
 */
async function savePortfolioSnapshots(date) {
  // 1. Get the exchange rate for this date
  const { data: fxRow, error: fxErr } = await supabaseAdmin
    .from('exchange_rates')
    .select('rate')
    .eq('pair', 'USD/MXN')
    .lte('date', date)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fxErr) throw new Error(`[snapshotService] FX rate lookup failed: ${fxErr.message}`);
  if (!fxRow) {
    console.warn(`[snapshotService] No USD/MXN rate available for ${date} — skipping portfolio snapshots.`);
    return;
  }
  const fxRate = parseFloat(fxRow.rate);

  // 2. Query the portfolio_daily_value view for this date (all users)
  const { data: rows, error: viewErr } = await supabaseAdmin
    .from('portfolio_daily_value')
    .select('user_id, total_value')
    .eq('date', date);

  if (viewErr) throw new Error(`[snapshotService] Portfolio view query failed: ${viewErr.message}`);
  if (!rows || rows.length === 0) {
    console.log(`[snapshotService] No portfolio values found for ${date}.`);
    return;
  }

  // 3. Build upsert payload
  const snapshots = rows.map((r) => ({
    user_id:   r.user_id,
    date,
    value_usd: parseFloat(r.total_value),
    value_mxn: parseFloat(r.total_value) * fxRate,
    fx_rate:   fxRate,
  }));

  const { error: upsertErr } = await supabaseAdmin
    .from('portfolio_value_snapshots')
    .upsert(snapshots, { onConflict: 'user_id,date' });

  if (upsertErr) throw new Error(`[snapshotService] Portfolio snapshot upsert failed: ${upsertErr.message}`);

  console.log(`[snapshotService] Saved portfolio snapshots for ${rows.length} user(s) on ${date} (rate: ${fxRate}).`);
}

/**
 * Catch up on any trading days missed while the server was offline.
 *
 * Called once at server startup (fire-and-forget). Finds the most recent date
 * in stocks_snapshot, then fetches the full missing range for every held symbol
 * via /time_series — one API call per symbol covers ALL missing days, so this
 * is very credit-efficient (10 symbols × 1 credit each, regardless of gap size).
 *
 * Uses 'normal' priority so it never starves the nightly cron job.
 * Does nothing if snapshots are already up to date.
 */
async function backfillSnapshots() {
  // 1. Find the most recent snapshot date across all symbols
  const { data: lastRow, error: lastErr } = await supabaseAdmin
    .from('stocks_snapshot')
    .select('date')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastErr) {
    console.warn(`[snapshotService] Backfill: could not query last date — ${lastErr.message}`);
    return;
  }
  if (!lastRow) {
    console.log('[snapshotService] Backfill: no existing snapshots — skipping (seed with POST /api/snapshots/run).');
    return;
  }

  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  if (lastRow.date >= yesterdayStr) {
    console.log(`[snapshotService] Backfill: up to date (last snapshot: ${lastRow.date}).`);
    return;
  }

  const startDate = new Date(lastRow.date + 'T00:00:00Z');
  startDate.setUTCDate(startDate.getUTCDate() + 1);
  const startStr = startDate.toISOString().slice(0, 10);

  console.log(`[snapshotService] Backfill: gap detected — fetching ${startStr} → ${yesterdayStr}`);

  // 2. Collect every held symbol (same logic as runSnapshots)
  const [stocksRes, fibrasRes, cryptoRes] = await Promise.all([
    supabaseAdmin.from('stocks').select('ticker'),
    supabaseAdmin.from('fibras').select('ticker'),
    supabaseAdmin.from('crypto').select('symbol'),
  ]);

  if (stocksRes.error || fibrasRes.error || cryptoRes.error) {
    console.warn('[snapshotService] Backfill: failed to load holdings — aborting.');
    return;
  }

  // Map tdSymbol → { rawTicker, assetType } so we can call fetchHistoricalTimeSeries
  const symbolMap = new Map();
  for (const row of (stocksRes.data || [])) {
    const tdSym = normalizeSymbol(row.ticker, 'stock');
    if (!symbolMap.has(tdSym)) symbolMap.set(tdSym, { rawTicker: row.ticker, assetType: 'stock' });
  }
  for (const row of (fibrasRes.data || [])) {
    const tdSym = normalizeSymbol(row.ticker, 'reit');
    if (!symbolMap.has(tdSym)) symbolMap.set(tdSym, { rawTicker: row.ticker, assetType: 'reit' });
  }
  for (const row of (cryptoRes.data || [])) {
    const tdSym = normalizeSymbol(row.symbol, 'crypto');
    if (!symbolMap.has(tdSym)) symbolMap.set(tdSym, { rawTicker: row.symbol, assetType: 'crypto' });
  }

  if (symbolMap.size === 0) {
    console.log('[snapshotService] Backfill: no holdings found — nothing to backfill.');
    return;
  }

  // 3. One /time_series call per symbol covers the entire missing date range
  const coveredDates = new Set();
  let totalBars = 0;

  for (const [tdSymbol, { rawTicker, assetType }] of symbolMap.entries()) {
    try {
      const bars = await enqueue(
        () => fetchHistoricalTimeSeries(rawTicker, assetType, startStr, yesterdayStr),
        { priority: 'normal', creditCost: 1 }
      );

      if (!bars.length) {
        console.log(`[snapshotService] Backfill: ${tdSymbol} — no data for range (market closed?)`);
        continue;
      }

      const rows = bars.map(b => ({
        symbol: tdSymbol,
        date:   b.date,
        open:   b.open,
        high:   b.high,
        low:    b.low,
        close:  b.close,
        volume: b.volume,
      }));

      const { error: upsertErr } = await supabaseAdmin
        .from('stocks_snapshot')
        .upsert(rows, { onConflict: 'symbol,date', ignoreDuplicates: true });

      if (upsertErr) {
        console.warn(`[snapshotService] Backfill: upsert error for ${tdSymbol} — ${upsertErr.message}`);
        continue;
      }

      bars.forEach(b => coveredDates.add(b.date));
      totalBars += bars.length;
      console.log(`[snapshotService] Backfill: ✓ ${tdSymbol} — ${bars.length} bar(s)`);
    } catch (err) {
      console.warn(`[snapshotService] Backfill: ✗ ${tdSymbol} — ${err.message}`);
    }
  }

  if (totalBars === 0) {
    console.log('[snapshotService] Backfill: no new bars written (all dates may be non-trading days).');
    return;
  }

  // 4. Rebuild portfolio snapshots for every newly covered date
  const sortedDates = [...coveredDates].sort();
  for (const date of sortedDates) {
    await savePortfolioSnapshots(date).catch(err =>
      console.warn(`[snapshotService] Backfill: portfolio snapshot failed for ${date} — ${err.message}`)
    );
  }

  console.log(`[snapshotService] Backfill complete — ${totalBars} bar(s) across ${coveredDates.size} trading day(s).`);
}

module.exports = { runSnapshots, savePortfolioSnapshots, backfillSnapshots };
