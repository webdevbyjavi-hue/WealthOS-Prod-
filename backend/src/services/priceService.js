'use strict';

/**
 * priceService.js
 * ───────────────
 * Wrapper around the Twelve Data API for fetching daily OHLCV data.
 *
 * API key env var: ALPHA_VANTAGE_API_KEY (naming is a legacy artifact — the
 * underlying API is Twelve Data, not Alpha Vantage).
 *
 * Free tier: 800 credits/day, 8 credits/minute.
 * Rate limiting is handled externally by requestQueue.js — this module
 * only makes the HTTP call and parses the response.
 *
 * 429s are surfaced as errors with err.status = 429 so requestQueue can
 * apply exponential backoff correctly.
 */

const TD_BASE = 'https://api.twelvedata.com';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Throw a human-readable error if Twelve Data signals a failure in the body. */
function assertTdOk(json, label) {
  if (json.status === 'error') {
    throw new Error(`Twelve Data error for ${label}: ${json.message}`);
  }
}

/**
 * Shared fetch wrapper that surfaces HTTP errors and 429s with a typed status.
 * @param {string} url
 * @param {string} label  — used in error messages
 */
async function _tdFetch(url, label) {
  const res = await fetch(url);

  if (res.status === 429) {
    const err = new Error(`TwelveData rate limit (429) for ${label}`);
    err.status = 429;
    throw err;
  }
  if (!res.ok) {
    throw new Error(`Twelve Data HTTP ${res.status} for ${label}`);
  }

  const json = await res.json();
  assertTdOk(json, label);
  return json;
}

/**
 * Convert a holding's raw ticker + asset type into the symbol format expected
 * by Twelve Data and used as the primary key in stocks_snapshot.
 *
 *   stock / etf / fund / bond / other  →  ticker as-is      e.g. 'AAPL', 'SPY'
 *   reit (fibras on BMV)               →  ticker + '.MX'    e.g. 'FUNO11.MX'
 *   crypto                             →  ticker + '/USD'   e.g. 'BTC/USD'
 *
 * @param {string} ticker
 * @param {string} assetType  — 'stock'|'etf'|'reit'|'crypto'|'bond'|'fund'|'other'
 * @returns {string}
 */
function normalizeSymbol(ticker, assetType) {
  if (assetType === 'crypto') {
    return ticker.includes('/') ? ticker : `${ticker}/USD`;
  }
  if (assetType === 'reit') {
    return ticker.includes('.') ? ticker : `${ticker}.MX`;
  }
  return ticker;
}

// ─── Single-symbol price fetchers (used by legacy fetchPrice) ─────────────────

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
  url.searchParams.set('symbol',     ticker);
  url.searchParams.set('interval',   '1day');
  url.searchParams.set('outputsize', '2');
  url.searchParams.set('apikey',     apiKey);

  const json = await _tdFetch(url.toString(), ticker);

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
  const url  = new URL(`${TD_BASE}/time_series`);
  url.searchParams.set('symbol',     pair);
  url.searchParams.set('interval',   '1day');
  url.searchParams.set('outputsize', '2');
  url.searchParams.set('apikey',     apiKey);

  const json = await _tdFetch(url.toString(), pair);

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

// ─── Batch quote (nightly snapshot job) ──────────────────────────────────────

/**
 * Parse a single Twelve Data /quote bar into our canonical shape.
 * @param {object} bar
 * @returns {{ date, open, high, low, close, volume }}
 */
function _parseQuoteBar(bar) {
  return {
    date:   (bar.datetime || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
    open:   bar.open   != null ? parseFloat(bar.open)   : null,
    high:   bar.high   != null ? parseFloat(bar.high)   : null,
    low:    bar.low    != null ? parseFloat(bar.low)    : null,
    close:  parseFloat(bar.close),
    volume: bar.volume != null ? parseFloat(bar.volume) : null,
  };
}

/**
 * Fetch the latest completed trading session for one or more symbols via
 * the Twelve Data /quote endpoint. One HTTP request regardless of batch size.
 *
 * Symbols must already be in Twelve Data format (use normalizeSymbol first).
 * Missing or errored symbols are omitted from the result Map — the caller
 * must check whether its requested symbols appear in the output.
 *
 * @param {string[]} tdSymbols  — e.g. ['AAPL', 'BTC/USD', 'FUNO11.MX']
 * @returns {Promise<Map<string, {date,open,high,low,close,volume}>>}
 */
async function fetchBatchQuote(tdSymbols) {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey || tdSymbols.length === 0) return new Map();

  const url = new URL(`${TD_BASE}/quote`);
  url.searchParams.set('symbol', tdSymbols.join(','));
  url.searchParams.set('apikey', apiKey);

  const label = `batch quote [${tdSymbols.join(',')}]`;
  const json  = await _tdFetch(url.toString(), label);

  const result = new Map();

  if (tdSymbols.length === 1) {
    // Single symbol → Twelve Data returns a flat object (not keyed)
    const sym = tdSymbols[0];
    if (json.status !== 'error' && json.close) {
      result.set(sym, _parseQuoteBar(json));
    } else if (json.status === 'error') {
      console.warn(`[priceService] /quote error for ${sym}: ${json.message}`);
    }
  } else {
    // Multiple symbols → object keyed by symbol
    for (const sym of tdSymbols) {
      const bar = json[sym];
      if (!bar) continue;
      if (bar.status === 'error') {
        console.warn(`[priceService] /quote error for ${sym}: ${bar.message}`);
        continue;
      }
      if (bar.close) result.set(sym, _parseQuoteBar(bar));
    }
  }

  return result;
}

// ─── Lookup helpers (ticker search, cached) ───────────────────────────────────

const _lookupCache = new Map(); // key → { data, expiresAt }
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

  const cached = _lookupCache.get(symbol);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const url = new URL(`${TD_BASE}/quote`);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('apikey', apiKey);

  const json = await _tdFetch(url.toString(), symbol);

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

  const json = await _tdFetch(url.toString(), pair);

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

// ─── Historical time series (backfill) ───────────────────────────────────────

/**
 * Fetch a full date-range of daily OHLCV bars for a stock, ETF, fibra, or crypto.
 * One API call covers the entire range — not one call per day.
 *
 * @param {string} ticker      — raw ticker as stored (e.g. 'AAPL', 'BTC', 'FUNO11')
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

  // normalizeSymbol handles crypto (BTC → BTC/USD) and reit (FUNO11 → FUNO11.MX)
  const symbol     = normalizeSymbol(ticker, assetType);
  const today      = new Date().toISOString().slice(0, 10);
  const resolvedEnd = endDate || today;

  const url = new URL(`${TD_BASE}/time_series`);
  url.searchParams.set('symbol',     symbol);
  url.searchParams.set('interval',   '1day');
  url.searchParams.set('start_date', startDate);
  url.searchParams.set('end_date',   resolvedEnd);
  url.searchParams.set('outputsize', '5000');
  url.searchParams.set('order',      'ASC');
  url.searchParams.set('apikey',     apiKey);

  const json = await _tdFetch(url.toString(), `${symbol} historical ${startDate}→${resolvedEnd}`);

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

  const fromD = new Date(targetDate + 'T12:00:00Z');
  fromD.setDate(fromD.getDate() - 7);
  const fromStr = fromD.toISOString().slice(0, 10);

  const url = new URL(`${TD_BASE}/time_series`);
  url.searchParams.set('symbol',     ticker.toUpperCase());
  url.searchParams.set('interval',   '1day');
  url.searchParams.set('start_date', fromStr);
  url.searchParams.set('end_date',   targetDate);
  url.searchParams.set('outputsize', '10');
  url.searchParams.set('order',      'DESC');
  url.searchParams.set('apikey',     apiKey);

  const json   = await _tdFetch(url.toString(), `${ticker} at ${targetDate}`);
  const values = json.values;
  if (!values || values.length === 0) return null;

  const bar = values[0];
  return { date: bar.datetime, price: parseFloat(bar.close) };
}

module.exports = {
  normalizeSymbol,
  fetchPrice,
  fetchStockPrice,
  fetchCryptoPrice,
  fetchBatchQuote,
  fetchStockInfo,
  fetchCryptoInfo,
  fetchHistoricalTimeSeries,
  fetchStockPriceAtDate,
};
