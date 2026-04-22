'use strict';

/**
 * backfillService.js
 * ──────────────────
 * Fetches and stores historical daily OHLCV data for an asset symbol,
 * starting from its purchase_date up to today.
 *
 * Key design:
 *   • Writes to stocks_snapshot keyed by (symbol, date) — shared globally.
 *     If ten users hold AAPL, the first backfill populates the table; all
 *     subsequent users find it already covered and issue zero API calls.
 *   • Gap detection queries the DB before making any API call. Fully-covered
 *     symbols return immediately without touching TwelveData.
 *   • Only the TwelveData fetch goes through requestQueue — gap detection and
 *     Supabase writes are not rate-limited API calls.
 *   • Rate limiting (8 req/min, 800/day) is enforced by requestQueue.js.
 *   • scheduleBackfill() is fire-and-forget — HTTP response is sent before
 *     any work begins. Errors are logged, never propagated.
 */

const { supabaseAdmin }                             = require('./supabaseClient');
const { fetchHistoricalTimeSeries, normalizeSymbol } = require('./priceService');
const { enqueue }                                   = require('./requestQueue');

const BATCH_SIZE = 500;

function _todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Query stocks_snapshot to find the earliest and latest stored date for a
 * symbol within the target range. Returns gap information without making
 * any TwelveData API call.
 *
 * @param {string} symbol       — TwelveData-formatted symbol (from normalizeSymbol)
 * @param {string} purchaseDate — YYYY-MM-DD
 * @returns {Promise<
 *   { needsFetch: false, reason: string } |
 *   { needsFetch: true,  fetchStart: string, fetchEnd: string }
 * >}
 */
async function _detectGap(symbol, purchaseDate) {
  const today = _todayUTC();

  if (purchaseDate > today) {
    return { needsFetch: false, reason: 'future_purchase_date' };
  }

  const [{ data: firstRows, error: e1 }, { data: lastRows, error: e2 }] =
    await Promise.all([
      supabaseAdmin
        .from('stocks_snapshot')
        .select('date')
        .eq('symbol', symbol)
        .gte('date', purchaseDate)
        .lte('date', today)
        .order('date', { ascending: true })
        .limit(1),
      supabaseAdmin
        .from('stocks_snapshot')
        .select('date')
        .eq('symbol', symbol)
        .gte('date', purchaseDate)
        .lte('date', today)
        .order('date', { ascending: false })
        .limit(1),
    ]);

  if (e1) throw e1;
  if (e2) throw e2;

  const earliest = firstRows?.[0]?.date ?? null;
  const latest   = lastRows?.[0]?.date  ?? null;

  if (earliest && earliest <= purchaseDate && latest >= today) {
    return { needsFetch: false, reason: 'fully_covered' };
  }

  return {
    needsFetch:  true,
    fetchStart:  purchaseDate,
    fetchEnd:    today,
  };
}

/**
 * Backfill historical daily prices for a single symbol.
 *
 * Issues zero TwelveData API calls when the symbol is already fully covered
 * in stocks_snapshot. Exported for direct use and testing.
 *
 * @param {string} ticker       — raw ticker as stored (e.g. 'AAPL', 'BTC', 'FUNO11')
 * @param {string} assetType    — 'stock'|'etf'|'reit'|'crypto'|...
 * @param {string} purchaseDate — YYYY-MM-DD
 * @returns {Promise<{ inserted: number, skipped: number, error: string|null }>}
 */
async function backfillSymbol(ticker, assetType, purchaseDate) {
  if (!purchaseDate) {
    return { inserted: 0, skipped: 0, error: null };
  }

  const symbol = normalizeSymbol(ticker, assetType);

  try {
    // ── 1. Gap detection (no API call) ────────────────────────────────────────
    const gap = await _detectGap(symbol, purchaseDate);

    if (!gap.needsFetch) {
      console.log(`[backfillService] ${symbol}: ${gap.reason} — skipping API call.`);
      return { inserted: 0, skipped: 1, error: null };
    }

    const { fetchStart, fetchEnd } = gap;
    console.log(`[backfillService] ${symbol}: fetching ${fetchStart} → ${fetchEnd}`);

    // ── 2. Rate-limited API call (NORMAL priority — nightly job takes precedence)
    const bars = await enqueue(
      () => fetchHistoricalTimeSeries(ticker, assetType, fetchStart, fetchEnd),
      { priority: 'normal', creditCost: 1 }
    );

    if (!bars || bars.length === 0) {
      console.log(`[backfillService] ${symbol}: API returned 0 bars — nothing to store.`);
      return { inserted: 0, skipped: 0, error: null };
    }

    // ── 3. Upsert into stocks_snapshot (shared table, keyed by symbol+date) ──
    const rows = bars.map((bar) => ({
      symbol,
      date:   bar.date,
      open:   bar.open   ?? null,
      high:   bar.high   ?? null,
      low:    bar.low    ?? null,
      close:  bar.close,
      volume: bar.volume ?? null,
    }));

    let inserted = 0;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);

      const { error: upsertErr } = await supabaseAdmin
        .from('stocks_snapshot')
        .upsert(batch, { onConflict: 'symbol,date' });

      if (upsertErr) throw upsertErr;
      inserted += batch.length;
    }

    console.log(`[backfillService] ${symbol}: stored ${inserted} snapshots.`);
    return { inserted, skipped: 0, error: null };

  } catch (err) {
    const message = err?.message || String(err);
    console.error(`[backfillService] ${symbol} backfill failed:`, message);
    return { inserted: 0, skipped: 0, error: message };
  }
}

/**
 * Fire-and-forget backfill scheduler.
 *
 * Drop-in replacement for the previous scheduleBackfill — same call signature.
 * Returns immediately; backfill runs in the background via requestQueue.
 * Errors are caught and logged — never propagated to the caller.
 *
 * @param {object} asset  — { ticker, asset_type, purchase_date, ... }
 */
function scheduleBackfill(asset) {
  const { ticker, asset_type, purchase_date } = asset;
  if (!purchase_date) return;

  setImmediate(() => {
    backfillSymbol(ticker, asset_type, purchase_date).catch((err) => {
      console.error(`[backfillService] Unhandled error for ${ticker}:`, err.message);
    });
  });
}

module.exports = { backfillSymbol, scheduleBackfill };
