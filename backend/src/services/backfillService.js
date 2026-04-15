'use strict';

/**
 * backfillService.js
 * ──────────────────
 * Fetches and stores historical daily OHLCV snapshots for an asset,
 * starting from its purchase_date up to today.
 *
 * Design:
 *   • One API call covers the entire date range — not one call per day.
 *   • Only fetches dates not already stored in asset_snapshots.
 *   • Upserts in batches of 500 to stay within Supabase payload limits.
 *   • backfillAsset() never throws — errors are caught, logged, returned.
 *   • scheduleBackfill() queues assets sequentially with an 8-second delay
 *     between jobs to respect the Twelve Data 8 req/min free-tier limit.
 */

const { supabaseAdmin } = require('./supabaseClient');
const { fetchHistoricalTimeSeries } = require('./priceService');

const BATCH_SIZE = 500;
const BACKFILL_DELAY_MS = parseInt(process.env.BACKFILL_RATE_DELAY_MS || '8000', 10);

/** Async sleep helper. */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Return today's date as YYYY-MM-DD (UTC). */
function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Backfill historical snapshots for one asset.
 *
 * Checks what date range is already stored and only fetches the missing prefix
 * (dates before the earliest stored snapshot). The daily cron fills trailing
 * days automatically, so we only need to handle the historical gap.
 *
 * @param {object} asset  — must include: id, ticker, asset_type, purchase_date
 * @returns {Promise<{ inserted: number, skipped: number, error: string|null }>}
 */
async function backfillAsset(asset) {
  const { id: assetId, ticker, asset_type, purchase_date } = asset;

  if (!purchase_date) {
    console.log(`[backfillService] ${ticker}: no purchase_date — skipping.`);
    return { inserted: 0, skipped: 0, error: null };
  }

  const today = todayUTC();

  try {
    // ── 1. Find the earliest + latest snapshot already stored ─────────────────
    const [{ data: firstRows, error: firstErr }, { data: lastRows, error: lastErr }] =
      await Promise.all([
        supabaseAdmin
          .from('asset_snapshots')
          .select('date')
          .eq('asset_id', assetId)
          .gte('date', purchase_date)
          .lte('date', today)
          .order('date', { ascending: true })
          .limit(1),
        supabaseAdmin
          .from('asset_snapshots')
          .select('date')
          .eq('asset_id', assetId)
          .gte('date', purchase_date)
          .lte('date', today)
          .order('date', { ascending: false })
          .limit(1),
      ]);

    if (firstErr) throw firstErr;
    if (lastErr)  throw lastErr;

    const earliestStored = firstRows?.[0]?.date ?? null;
    const latestStored   = lastRows?.[0]?.date  ?? null;

    // ── 2. Determine the date range to fetch ──────────────────────────────────
    // If snapshots already cover from purchase_date to today, nothing to do.
    if (earliestStored && latestStored) {
      if (earliestStored <= purchase_date && latestStored >= today) {
        console.log(`[backfillService] ${ticker}: snapshots complete — skipping API call.`);
        return { inserted: 0, skipped: 0, error: null };
      }
    }

    // Fetch from purchase_date up to the day before the earliest stored snapshot
    // (if any). The daily cron handles everything from latestStored onwards.
    const fetchStart = purchase_date;
    const fetchEnd   = earliestStored
      ? earliestStored  // upsert will handle the overlap cleanly via ON CONFLICT
      : today;

    // ── 3. One API call for the full date range ────────────────────────────────
    console.log(`[backfillService] ${ticker}: fetching ${fetchStart} → ${fetchEnd} ...`);

    const bars = await fetchHistoricalTimeSeries(ticker, asset_type, fetchStart, fetchEnd);

    if (!bars || bars.length === 0) {
      console.log(`[backfillService] ${ticker}: API returned 0 bars — nothing to store.`);
      return { inserted: 0, skipped: 0, error: null };
    }

    // ── 4. Upsert in batches of BATCH_SIZE ────────────────────────────────────
    const rows = bars.map((bar) => ({
      asset_id:   assetId,
      date:       bar.date,
      open:       bar.open   ?? null,
      high:       bar.high   ?? null,
      low:        bar.low    ?? null,
      close:      bar.close,
      volume:     bar.volume ?? null,
      market_cap: null,  // Twelve Data time_series does not include market_cap
    }));

    let inserted = 0;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);

      const { error: upsertErr } = await supabaseAdmin
        .from('asset_snapshots')
        .upsert(batch, { onConflict: 'asset_id,date' });

      if (upsertErr) throw upsertErr;
      inserted += batch.length;
    }

    console.log(`[backfillService] ${ticker}: stored ${inserted} snapshots.`);
    return { inserted, skipped: 0, error: null };

  } catch (err) {
    const message = err?.message || String(err);
    console.error(`[backfillService] ${ticker} backfill failed:`, message);
    return { inserted: 0, skipped: 0, error: message };
  }
}

// ─── Sequential backfill queue ────────────────────────────────────────────────
// Processes one asset at a time with BACKFILL_DELAY_MS between jobs.
// Prevents rate-limit breaches when multiple holdings are added simultaneously.

const _queue = [];
let _running = false;

async function _drain() {
  if (_running) return;
  _running = true;
  try {
    while (_queue.length > 0) {
      const asset = _queue.shift();
      await backfillAsset(asset);
      if (_queue.length > 0) await sleep(BACKFILL_DELAY_MS);
    }
  } finally {
    _running = false;
  }
}

/**
 * Fire-and-forget backfill scheduler.
 *
 * Adds the asset to the queue and returns immediately — the HTTP response is
 * sent before any backfill work begins. Errors are caught inside backfillAsset.
 *
 * @param {object} asset  — same shape as backfillAsset (id, ticker, asset_type, purchase_date)
 */
function scheduleBackfill(asset) {
  _queue.push(asset);
  setImmediate(_drain);
}

module.exports = { backfillAsset, scheduleBackfill };
