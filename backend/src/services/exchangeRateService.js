'use strict';

/**
 * exchangeRateService.js
 * ──────────────────────
 * Fetches the USD/MXN exchange rate from Twelve Data and caches it
 * in the `exchange_rates` Supabase table.
 *
 * Strategy (API-call-efficient):
 *   1. On request, read today's rate from Supabase first.
 *   2. Only hit the Twelve Data API when the DB has no entry for today.
 *   3. A daily cron job calls `runExchangeRateUpdate()` once per day to
 *      warm the cache for all users before any request arrives.
 *
 * Twelve Data `/price` endpoint costs 1 credit per call.
 * Docs: https://twelvedata.com/docs#price
 */

const { createClient } = require('@supabase/supabase-js');

const TD_BASE  = 'https://api.twelvedata.com';
const FX_PAIR  = 'USD/MXN';

/** Supabase admin client — bypasses RLS so we can write to the shared table. */
function getAdminClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/** Returns today's date string in YYYY-MM-DD (UTC). */
function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Fetch the current USD/MXN spot rate from Twelve Data.
 * Returns a plain number (e.g. 17.25) or throws on error.
 *
 * @returns {Promise<number>}
 */
async function fetchRateFromApi() {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    throw new Error('[exchangeRateService] ALPHA_VANTAGE_API_KEY not set — cannot fetch rate.');
  }

  const url = new URL(`${TD_BASE}/price`);
  url.searchParams.set('symbol', FX_PAIR);
  url.searchParams.set('apikey', apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`[exchangeRateService] Twelve Data HTTP ${res.status} for ${FX_PAIR}`);
  }

  const json = await res.json();
  if (json.status === 'error') {
    throw new Error(`[exchangeRateService] Twelve Data error: ${json.message}`);
  }

  const rate = parseFloat(json.price);
  if (isNaN(rate) || rate <= 0) {
    throw new Error(`[exchangeRateService] Unexpected rate value: ${json.price}`);
  }

  return rate;
}

/**
 * Upsert a rate record into the `exchange_rates` table.
 *
 * @param {string} date   — YYYY-MM-DD
 * @param {number} rate   — e.g. 17.25
 */
async function saveRate(date, rate) {
  const supabase = getAdminClient();
  const { error } = await supabase
    .from('exchange_rates')
    .upsert(
      { date, pair: FX_PAIR, rate, source: 'twelvedata' },
      { onConflict: 'date,pair' }
    );

  if (error) {
    throw new Error(`[exchangeRateService] Failed to save rate: ${error.message}`);
  }
}

/**
 * Returns the most recent cached USD/MXN rate from Supabase.
 * If the DB is empty, returns null.
 *
 * @returns {Promise<{ date: string, rate: number }|null>}
 */
async function getLatestCachedRate() {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('exchange_rates')
    .select('date, rate')
    .eq('pair', FX_PAIR)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`[exchangeRateService] DB read failed: ${error.message}`);
  }

  return data || null; // { date, rate } or null
}

/**
 * Main entry point for API requests.
 *
 * Returns today's rate if already cached; otherwise fetches it from
 * Twelve Data, saves it, and returns it. Falls back to the most recent
 * cached rate (e.g. on weekends when no new rate is published).
 *
 * @returns {Promise<{ date: string, rate: number, cached: boolean }>}
 */
async function getOrFetchTodayRate() {
  const today = todayUtc();
  const supabase = getAdminClient();

  // 1. Check for today's rate in DB
  const { data: todayRow, error } = await supabase
    .from('exchange_rates')
    .select('date, rate')
    .eq('pair', FX_PAIR)
    .eq('date', today)
    .maybeSingle();

  if (error) {
    throw new Error(`[exchangeRateService] DB read failed: ${error.message}`);
  }

  if (todayRow) {
    return { date: todayRow.date, rate: todayRow.rate, cached: true };
  }

  // 2. Not in DB — try to fetch from API
  try {
    const rate = await fetchRateFromApi();
    await saveRate(today, rate);
    return { date: today, rate, cached: false };
  } catch (apiErr) {
    console.warn(`[exchangeRateService] API fetch failed (${apiErr.message}), falling back to latest cached rate.`);

    // 3. API failed — return the most recent cached rate as a fallback
    const latest = await getLatestCachedRate();
    if (latest) {
      return { date: latest.date, rate: latest.rate, cached: true };
    }

    // 4. Nothing available at all
    throw new Error('[exchangeRateService] No exchange rate available: API unreachable and DB cache is empty.');
  }
}

/**
 * Called by the daily cron job.
 * Always fetches a fresh rate from the API and upserts it for today.
 *
 * @returns {Promise<{ date: string, rate: number }>}
 */
async function runExchangeRateUpdate() {
  const today = todayUtc();
  const rate  = await fetchRateFromApi();
  await saveRate(today, rate);
  console.log(`[exchangeRateService] USD/MXN rate for ${today}: ${rate}`);
  return { date: today, rate };
}

/**
 * Fetch a daily USD/MXN close rate from Twelve Data's time_series endpoint
 * for a window ending on `date`. Returns the most-recent close in that window
 * (handles weekends/holidays by looking back up to 7 days).
 *
 * @param {string} date — YYYY-MM-DD
 * @returns {Promise<number>}
 */
async function fetchHistoricalRateFromApi(date) {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    throw new Error('[exchangeRateService] ALPHA_VANTAGE_API_KEY not set.');
  }

  // Request up to 7 days ending on `date` to handle weekends/holidays
  const endDate   = date;
  const startDate = new Date(date);
  startDate.setDate(startDate.getDate() - 7);
  const startDateStr = startDate.toISOString().slice(0, 10);

  const url = new URL(`${TD_BASE}/time_series`);
  url.searchParams.set('symbol',     FX_PAIR);
  url.searchParams.set('interval',   '1day');
  url.searchParams.set('start_date', startDateStr);
  url.searchParams.set('end_date',   endDate);
  url.searchParams.set('outputsize', '10');
  url.searchParams.set('apikey',     apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`[exchangeRateService] Twelve Data HTTP ${res.status}`);
  }

  const json = await res.json();
  if (json.status === 'error') {
    throw new Error(`[exchangeRateService] Twelve Data error: ${json.message}`);
  }

  const values = json.values;
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`[exchangeRateService] No historical data for ${date}`);
  }

  // values[0] is the most-recent day (ascending false by default)
  const rate = parseFloat(values[0].close);
  if (isNaN(rate) || rate <= 0) {
    throw new Error(`[exchangeRateService] Unexpected rate value: ${values[0].close}`);
  }

  return { rate, actualDate: values[0].datetime };
}

/**
 * Returns the USD/MXN rate for a specific date.
 *
 * Strategy:
 *   1. Check Supabase for an exact match on `date`.
 *   2. If missing, fetch from Twelve Data time_series (looks back up to 7 days
 *      so weekends/holidays resolve to the nearest prior trading day).
 *   3. Save the found rate under the requested `date` for future cache hits.
 *   4. Fall back to the nearest prior cached rate if the API fails.
 *
 * @param {string} date — YYYY-MM-DD
 * @returns {Promise<{ date: string, rate: number, cached: boolean }>}
 */
async function getRateForDate(date) {
  const supabase = getAdminClient();

  // 1. Check DB for exact date
  const { data: row, error } = await supabase
    .from('exchange_rates')
    .select('date, rate')
    .eq('pair', FX_PAIR)
    .eq('date', date)
    .maybeSingle();

  if (error) throw new Error(`[exchangeRateService] DB read failed: ${error.message}`);
  if (row) return { date: row.date, rate: row.rate, cached: true };

  // 2. Not cached — fetch from Twelve Data
  try {
    const { rate, actualDate } = await fetchHistoricalRateFromApi(date);
    // Cache under the requested date (not actualDate) so lookups always hit
    await saveRate(date, rate);
    return { date, rate, cached: false };
  } catch (apiErr) {
    console.warn(`[exchangeRateService] Historical fetch failed (${apiErr.message}), falling back to nearest cached rate.`);

    // 3. Fall back to the closest prior cached rate
    const { data: fallback, error: fbErr } = await supabase
      .from('exchange_rates')
      .select('date, rate')
      .eq('pair', FX_PAIR)
      .lte('date', date)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fbErr) throw new Error(`[exchangeRateService] DB fallback failed: ${fbErr.message}`);
    if (fallback) return { date: fallback.date, rate: fallback.rate, cached: true };

    throw new Error('[exchangeRateService] No exchange rate available for ' + date);
  }
}

module.exports = { getOrFetchTodayRate, getRateForDate, runExchangeRateUpdate };
