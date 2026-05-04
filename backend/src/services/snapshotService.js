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

  // ── 4. Persist per-user portfolio values in MXN (all asset types + accounts)
  await savePortfolioSnapshots(runDate).catch((err) =>
    console.error('[snapshotService] Portfolio snapshot failed:', err.message)
  );

  return { date: runDate, total: symbols.length, succeeded, failed, results };
}

/**
 * Compute each user's TOTAL portfolio value across ALL asset types for `date`
 * and upsert into portfolio_value_snapshots. Idempotent — safe to re-run.
 *
 * Market assets (stocks, fibras, crypto):
 *   - On trading days: uses portfolio_daily_value view (accurate close prices).
 *   - On non-trading days (weekends/holidays): falls back to stored current
 *     prices in the holdings tables (market was closed, prices unchanged).
 *
 * Manual assets (bonos, fondos, retiro, bienes): always uses current DB values.
 * Accounts: uses account_balance_snapshots for `date` if already snapped,
 *   otherwise falls back to the live accounts table.
 *
 * All values are summed in MXN using the day's USD/MXN exchange rate.
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

  // 2. Query market-priced assets from portfolio_daily_value (trading days only)
  const { data: marketRows, error: viewErr } = await supabaseAdmin
    .from('portfolio_daily_value')
    .select('user_id, total_value')
    .eq('date', date);

  if (viewErr) throw new Error(`[snapshotService] Portfolio view query failed: ${viewErr.message}`);

  // 3. Query every holdings table and accounts in parallel
  const [bonosRes, fondosRes, retiroRes, bienesRes, acctSnapRes, acctRes, stocksRes, fibrasRes, cryptoRes] =
    await Promise.all([
      supabaseAdmin.from('bonos').select('user_id, monto'),
      supabaseAdmin.from('fondos').select('user_id, nav_actual, unidades'),
      supabaseAdmin.from('retiro').select('user_id, saldo'),
      supabaseAdmin.from('bienes').select('user_id, valor_actual, saldo_hipoteca'),
      supabaseAdmin.from('account_balance_snapshots').select('user_id, balance_mxn').eq('date', date),
      supabaseAdmin.from('accounts').select('user_id, balance, fx_rate'),
      supabaseAdmin.from('stocks').select('user_id, shares, current_price'),
      supabaseAdmin.from('fibras').select('user_id, certificados, precio_actual'),
      supabaseAdmin.from('crypto').select('user_id, amount, current_price'),
    ]);

  // 4. Accumulate per-user totals in MXN
  const byUser = new Map(); // user_id → { market_mxn, manual_mxn, accounts_mxn }
  const ensure = (uid) => {
    if (!byUser.has(uid)) byUser.set(uid, { market_mxn: 0, manual_mxn: 0, accounts_mxn: 0 });
  };

  // Market assets — prefer accurate close prices from the VIEW on trading days;
  // fall back to stored current_price values on weekends/holidays.
  if (marketRows && marketRows.length > 0) {
    for (const r of marketRows) {
      ensure(r.user_id);
      // portfolio_daily_value.total_value is in USD — convert to MXN
      byUser.get(r.user_id).market_mxn += parseFloat(r.total_value || 0) * fxRate;
    }
  } else {
    // Non-trading day: compute from current prices stored in holdings tables
    for (const s of (stocksRes.data || [])) {
      ensure(s.user_id);
      byUser.get(s.user_id).market_mxn +=
        parseFloat(s.shares || 0) * parseFloat(s.current_price || 0) * fxRate;
    }
    for (const f of (fibrasRes.data || [])) {
      ensure(f.user_id);
      byUser.get(f.user_id).market_mxn +=
        parseInt(f.certificados || 0) * parseFloat(f.precio_actual || 0);
    }
    for (const c of (cryptoRes.data || [])) {
      ensure(c.user_id);
      byUser.get(c.user_id).market_mxn +=
        parseFloat(c.amount || 0) * parseFloat(c.current_price || 0) * fxRate;
    }
  }

  // Manual assets — always current DB values (all in MXN)
  for (const b of (bonosRes.data || [])) {
    ensure(b.user_id);
    byUser.get(b.user_id).manual_mxn += parseFloat(b.monto || 0);
  }
  for (const f of (fondosRes.data || [])) {
    ensure(f.user_id);
    byUser.get(f.user_id).manual_mxn +=
      parseFloat(f.nav_actual || 0) * parseFloat(f.unidades || 0);
  }
  for (const r of (retiroRes.data || [])) {
    ensure(r.user_id);
    byUser.get(r.user_id).manual_mxn += parseFloat(r.saldo || 0);
  }
  for (const b of (bienesRes.data || [])) {
    ensure(b.user_id);
    byUser.get(b.user_id).manual_mxn +=
      Math.max(0, parseFloat(b.valor_actual || 0) - parseFloat(b.saldo_hipoteca || 0));
  }

  // Accounts — use today's snapshot if available, otherwise live balances
  const acctSnaps = acctSnapRes.data || [];
  if (acctSnaps.length > 0) {
    for (const a of acctSnaps) {
      ensure(a.user_id);
      byUser.get(a.user_id).accounts_mxn += parseFloat(a.balance_mxn || 0);
    }
  } else {
    for (const a of (acctRes.data || [])) {
      ensure(a.user_id);
      byUser.get(a.user_id).accounts_mxn +=
        parseFloat(a.balance || 0) * parseFloat(a.fx_rate || 1);
    }
  }

  if (byUser.size === 0) {
    console.log(`[snapshotService] No user data found for ${date} — skipping.`);
    return;
  }

  // 5. Build upsert payload
  const snapshots = [];
  for (const [uid, { market_mxn, manual_mxn, accounts_mxn }] of byUser.entries()) {
    const value_mxn = market_mxn + manual_mxn + accounts_mxn;
    snapshots.push({
      user_id:   uid,
      date,
      value_usd: parseFloat((value_mxn / fxRate).toFixed(2)),
      value_mxn: parseFloat(value_mxn.toFixed(2)),
      fx_rate:   fxRate,
    });
  }

  const { error: upsertErr } = await supabaseAdmin
    .from('portfolio_value_snapshots')
    .upsert(snapshots, { onConflict: 'user_id,date' });

  if (upsertErr) throw new Error(`[snapshotService] Portfolio snapshot upsert failed: ${upsertErr.message}`);

  console.log(
    `[snapshotService] Saved portfolio snapshots for ${snapshots.length} user(s) on ${date}` +
    ` (rate: ${fxRate}, market rows: ${marketRows?.length ?? 0}).`
  );
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
