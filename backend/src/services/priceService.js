'use strict';

/**
 * priceService.js
 * ───────────────
 * Wrapper around the Twelve Data API for fetching the latest daily
 * OHLCV data for stocks/ETFs and crypto assets.
 *
 * API key is read from ALPHA_VANTAGE_API_KEY in the environment.
 * If the key is absent the service returns null and the caller should
 * treat the fetch as a no-op (snapshot service will skip that asset).
 *
 * Twelve Data free tier: 800 credits/day, 8 requests/minute.
 *
 * Docs: https://twelvedata.com/docs
 */

const TD_BASE = 'https://api.twelvedata.com';

/** Throw a human-readable error if Twelve Data signals a failure in the body. */
function assertTdOk(json, label) {
  if (json.status === 'error') {
    throw new Error(`Twelve Data error for ${label}: ${json.message}`);
  }
}

/**
 * Fetch the most-recent daily OHLCV record for a stock or ETF.
 *
 * @param {string} ticker  — e.g. "AAPL", "SPY"
 * @returns {Promise<{date, open, high, low, close, volume}|null>}
 */
async function fetchStockPrice(ticker) {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    console.warn('[priceService] ALPHA_VANTAGE_API_KEY not set — skipping price fetch.');
    return null;
  }

  const url = new URL(`${TD_BASE}/time_series`);
  url.searchParams.set('symbol', ticker);
  url.searchParams.set('interval', '1day');
  url.searchParams.set('outputsize', '2');
  url.searchParams.set('apikey', apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Twelve Data HTTP ${res.status} for ticker ${ticker}`);

  const json = await res.json();
  assertTdOk(json, ticker);

  const values = json.values;
  if (!values || values.length === 0) {
    throw new Error(`Twelve Data: no time-series data returned for ${ticker}`);
  }

  const bar = values[0];
  return {
    date:   bar.datetime,
    open:   parseFloat(bar.open),
    high:   parseFloat(bar.high),
    low:    parseFloat(bar.low),
    close:  parseFloat(bar.close),
    volume: parseFloat(bar.volume),
  };
}

/**
 * Fetch the most-recent daily OHLCV record for a cryptocurrency.
 *
 * @param {string} symbol   — e.g. "BTC", "ETH"
 * @param {string} market   — quote currency, e.g. "USD"
 * @returns {Promise<{date, open, high, low, close, volume}|null>}
 */
async function fetchCryptoPrice(symbol, market = 'USD') {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    console.warn('[priceService] ALPHA_VANTAGE_API_KEY not set — skipping price fetch.');
    return null;
  }

  const pair = `${symbol}/${market}`;
  const url = new URL(`${TD_BASE}/time_series`);
  url.searchParams.set('symbol', pair);
  url.searchParams.set('interval', '1day');
  url.searchParams.set('outputsize', '2');
  url.searchParams.set('apikey', apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Twelve Data HTTP ${res.status} for crypto ${pair}`);

  const json = await res.json();
  assertTdOk(json, pair);

  const values = json.values;
  if (!values || values.length === 0) {
    throw new Error(`Twelve Data: no time-series data returned for ${pair}`);
  }

  const bar = values[0];
  return {
    date:   bar.datetime,
    open:   parseFloat(bar.open),
    high:   parseFloat(bar.high),
    low:    parseFloat(bar.low),
    close:  parseFloat(bar.close),
    volume: parseFloat(bar.volume),
  };
}

/**
 * Dispatch to the correct fetcher based on asset_type.
 *
 * @param {object} asset  — { ticker, asset_type, currency }
 * @returns {Promise<object|null>}
 */
async function fetchPrice(asset) {
  if (asset.asset_type === 'crypto') {
    return fetchCryptoPrice(asset.ticker, asset.currency || 'USD');
  }
  return fetchStockPrice(asset.ticker);
}

// ─── In-memory cache for ticker lookups (5-minute TTL) ───────────────────────
const _lookupCache = new Map(); // ticker → { data, expiresAt }
const LOOKUP_TTL_MS = 5 * 60 * 1000;

/**
 * Fetch company name and latest price for a stock ticker.
 * Uses Twelve Data /quote endpoint, cached for 5 min.
 *
 * @param {string} ticker  — e.g. "AAPL"
 * @returns {Promise<{ticker, name, price}|null>}
 */
async function fetchStockInfo(ticker) {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) return null;

  const symbol = ticker.toUpperCase();

  // Return cached result if still fresh
  const cached = _lookupCache.get(symbol);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const url = new URL(`${TD_BASE}/quote`);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('apikey', apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Twelve Data HTTP ${res.status} for ticker ${symbol}`);

  const json = await res.json();
  assertTdOk(json, symbol);

  if (!json.close) {
    throw new Error(`No data found for ticker "${symbol}". Check the symbol and try again.`);
  }

  const data = {
    ticker: json.symbol || symbol,
    name:   json.name   || symbol,
    price:  parseFloat(json.close),
  };

  _lookupCache.set(symbol, { data, expiresAt: Date.now() + LOOKUP_TTL_MS });
  return data;
}

/**
 * Fetch coin name and latest price for a cryptocurrency symbol.
 * Uses Twelve Data /quote endpoint with symbol=COIN/USD, cached for 5 min.
 *
 * @param {string} symbol  — e.g. "BTC", "ETH"
 * @returns {Promise<{symbol, name, price}|null>}
 */
async function fetchCryptoInfo(symbol) {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) return null;

  const coin = symbol.toUpperCase();
  const pair = `${coin}/USD`;

  const cached = _lookupCache.get(pair);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const url = new URL(`${TD_BASE}/quote`);
  url.searchParams.set('symbol', pair);
  url.searchParams.set('apikey', apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Twelve Data HTTP ${res.status} for crypto ${pair}`);

  const json = await res.json();
  assertTdOk(json, pair);

  if (!json.close) {
    throw new Error(`No data found for "${coin}". Check the symbol and try again.`);
  }

  const data = {
    symbol: coin,
    name:   json.name || coin,
    price:  parseFloat(json.close),
  };

  _lookupCache.set(pair, { data, expiresAt: Date.now() + LOOKUP_TTL_MS });
  return data;
}

/**
 * Fetch a full date-range of daily OHLCV bars for a stock, ETF, or crypto.
 *
 * One API call covers the entire range — not one call per day. This is the
 * efficient path for backfilling history from a purchase date.
 *
 * @param {string} ticker      — e.g. "AAPL", "BTC"
 * @param {string} assetType   — 'stock'|'etf'|'reit'|'crypto'|'bond'|'fund'|'other'
 * @param {string} startDate   — YYYY-MM-DD (inclusive)
 * @param {string} [endDate]   — YYYY-MM-DD (inclusive), defaults to today UTC
 * @returns {Promise<Array<{date, open, high, low, close, volume}>>}
 *          Sorted ascending by date. Empty array if no data or no API key.
 */
async function fetchHistoricalTimeSeries(ticker, assetType, startDate, endDate) {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    console.warn('[priceService] ALPHA_VANTAGE_API_KEY not set — skipping historical fetch.');
    return [];
  }

  // Crypto must use "COIN/USD" pair format; all others use the plain ticker.
  const symbol = assetType === 'crypto'
    ? (ticker.includes('/') ? ticker : `${ticker}/USD`)
    : ticker;

  const today = new Date().toISOString().slice(0, 10);
  const resolvedEnd = endDate || today;

  const url = new URL(`${TD_BASE}/time_series`);
  url.searchParams.set('symbol',     symbol);
  url.searchParams.set('interval',   '1day');
  url.searchParams.set('start_date', startDate);
  url.searchParams.set('end_date',   resolvedEnd);
  url.searchParams.set('outputsize', '5000');  // max bars — handles ~14 years of history
  url.searchParams.set('order',      'ASC');   // oldest → newest for sequential upsert
  url.searchParams.set('apikey',     apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Twelve Data HTTP ${res.status} for ${symbol} (historical ${startDate}→${resolvedEnd})`);
  }

  const json = await res.json();
  assertTdOk(json, symbol);

  const values = json.values;
  if (!values || values.length === 0) return [];

  return values.map((bar) => ({
    date:   bar.datetime,
    open:   bar.open   != null ? parseFloat(bar.open)   : null,
    high:   bar.high   != null ? parseFloat(bar.high)   : null,
    low:    bar.low    != null ? parseFloat(bar.low)    : null,
    close:  parseFloat(bar.close),
    volume: bar.volume != null ? parseFloat(bar.volume) : null,
  }));
}

/**
 * Fetch the closing price of a stock on or before a specific date.
 * Looks back up to 7 calendar days to cover weekends and market holidays.
 *
 * @param {string} ticker      — e.g. "AAPL"
 * @param {string} targetDate  — YYYY-MM-DD
 * @returns {Promise<{date: string, price: number}|null>}
 */
async function fetchStockPriceAtDate(ticker, targetDate) {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) return null;

  // Look back 7 days to cover weekends + market holidays
  const fromD = new Date(targetDate + 'T12:00:00Z');
  fromD.setDate(fromD.getDate() - 7);
  const fromStr = fromD.toISOString().slice(0, 10);

  const url = new URL(`${TD_BASE}/time_series`);
  url.searchParams.set('symbol',     ticker.toUpperCase());
  url.searchParams.set('interval',   '1day');
  url.searchParams.set('start_date', fromStr);
  url.searchParams.set('end_date',   targetDate);
  url.searchParams.set('outputsize', '10');  // covers any holiday stretch
  url.searchParams.set('order',      'DESC'); // most recent first
  url.searchParams.set('apikey',     apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Twelve Data HTTP ${res.status} for ${ticker} at ${targetDate}`);

  const json = await res.json();
  assertTdOk(json, ticker);

  const values = json.values;
  if (!values || values.length === 0) return null;

  // First bar in DESC order = most recent trading day at or before targetDate
  const bar = values[0];
  return { date: bar.datetime, price: parseFloat(bar.close) };
}

module.exports = {
  fetchPrice,
  fetchStockPrice,
  fetchCryptoPrice,
  fetchStockInfo,
  fetchCryptoInfo,
  fetchHistoricalTimeSeries,
  fetchStockPriceAtDate,
};
