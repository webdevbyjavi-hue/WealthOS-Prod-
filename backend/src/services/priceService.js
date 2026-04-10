'use strict';

/**
 * priceService.js
 * ───────────────
 * Thin wrapper around the Alpha Vantage API for fetching the latest
 * daily OHLCV data for stocks/ETFs and crypto assets.
 *
 * API key is read from ALPHA_VANTAGE_API_KEY in the environment.
 * If the key is absent the service returns null and the caller should
 * treat the fetch as a no-op (snapshot service will skip that asset).
 *
 * Alpha Vantage free tier: 25 requests/day, 5 requests/minute.
 * For burst protection the snapshot service should call fetchPrice()
 * sequentially, not in parallel.
 *
 * Docs: https://www.alphavantage.co/documentation/
 */

const AV_BASE = 'https://www.alphavantage.co/query';

/**
 * Fetch the most-recent daily OHLCV record for a stock or ETF.
 *
 * @param {string} ticker  — e.g. "AAPL", "SPY"
 * @returns {Promise<{open, high, low, close, volume}|null>}
 */
async function fetchStockPrice(ticker) {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    console.warn('[priceService] ALPHA_VANTAGE_API_KEY not set — skipping price fetch.');
    return null;
  }

  const url = new URL(AV_BASE);
  url.searchParams.set('function', 'TIME_SERIES_DAILY');
  url.searchParams.set('symbol', ticker);
  url.searchParams.set('outputsize', 'compact');  // last 100 trading days
  url.searchParams.set('apikey', apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Alpha Vantage HTTP ${res.status} for ticker ${ticker}`);
  }

  const json = await res.json();

  // Alpha Vantage signals errors inside the JSON body
  if (json['Error Message']) {
    throw new Error(`Alpha Vantage error for ${ticker}: ${json['Error Message']}`);
  }
  if (json['Note']) {
    throw new Error(`Alpha Vantage rate-limit hit for ${ticker}: ${json['Note']}`);
  }
  if (json['Information']) {
    throw new Error(`Alpha Vantage API limit for ${ticker}: ${json['Information']}`);
  }

  const timeSeries = json['Time Series (Daily)'];
  if (!timeSeries) {
    throw new Error(`Alpha Vantage: no time-series data returned for ${ticker}`);
  }

  // The most recent date is the first key when sorted descending
  const latestDate = Object.keys(timeSeries).sort().reverse()[0];
  const bar = timeSeries[latestDate];

  return {
    date:   latestDate,
    open:   parseFloat(bar['1. open']),
    high:   parseFloat(bar['2. high']),
    low:    parseFloat(bar['3. low']),
    close:  parseFloat(bar['4. close']),
    volume: parseFloat(bar['5. volume']),
  };
}

/**
 * Fetch the most-recent daily OHLCV record for a cryptocurrency.
 * Alpha Vantage returns crypto prices in the specified market currency.
 *
 * @param {string} symbol   — e.g. "BTC", "ETH"
 * @param {string} market   — quote currency, e.g. "USD"
 * @returns {Promise<{open, high, low, close, volume, market_cap}|null>}
 */
async function fetchCryptoPrice(symbol, market = 'USD') {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    console.warn('[priceService] ALPHA_VANTAGE_API_KEY not set — skipping price fetch.');
    return null;
  }

  const url = new URL(AV_BASE);
  url.searchParams.set('function', 'DIGITAL_CURRENCY_DAILY');
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('market', market);
  url.searchParams.set('apikey', apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Alpha Vantage HTTP ${res.status} for crypto ${symbol}`);
  }

  const json = await res.json();

  if (json['Error Message']) {
    throw new Error(`Alpha Vantage error for ${symbol}: ${json['Error Message']}`);
  }
  if (json['Note'] || json['Information']) {
    throw new Error(`Alpha Vantage rate-limit hit for ${symbol}`);
  }

  const timeSeries = json['Time Series (Digital Currency Daily)'];
  if (!timeSeries) {
    throw new Error(`Alpha Vantage: no crypto time-series data for ${symbol}`);
  }

  const latestDate = Object.keys(timeSeries).sort().reverse()[0];
  const bar = timeSeries[latestDate];

  return {
    date:       latestDate,
    open:       parseFloat(bar[`1a. open (${market})`]),
    high:       parseFloat(bar[`2a. high (${market})`]),
    low:        parseFloat(bar[`3a. low (${market})`]),
    close:      parseFloat(bar[`4a. close (${market})`]),
    volume:     parseFloat(bar['5. volume']),
    market_cap: parseFloat(bar['6. market cap (USD)']),
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
  // stock / etf / bond / reit / fund / other → equity endpoint
  return fetchStockPrice(asset.ticker);
}

// ─── In-memory cache for ticker lookups (5-minute TTL) ───────────────────────
const _lookupCache = new Map(); // ticker → { data, expiresAt }
const LOOKUP_TTL_MS = 5 * 60 * 1000;

/**
 * Fetch company name and latest price for a stock ticker.
 * Calls GLOBAL_QUOTE and OVERVIEW in parallel then caches the result for 5 min.
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

  const makeUrl = (fn) => {
    const u = new URL(AV_BASE);
    u.searchParams.set('function', fn);
    u.searchParams.set('symbol', symbol);
    u.searchParams.set('apikey', apiKey);
    return u.toString();
  };

  const [quoteRes, overviewRes] = await Promise.all([
    fetch(makeUrl('GLOBAL_QUOTE')),
    fetch(makeUrl('OVERVIEW')),
  ]);

  const [quoteJson, overviewJson] = await Promise.all([
    quoteRes.json(),
    overviewRes.json(),
  ]);

  // Surface Alpha Vantage API-level errors
  for (const json of [quoteJson, overviewJson]) {
    if (json['Error Message']) throw new Error(json['Error Message']);
    if (json['Note'])          throw new Error(`Alpha Vantage rate limit hit: ${json['Note']}`);
    if (json['Information'])   throw new Error(`Alpha Vantage API limit: ${json['Information']}`);
  }

  const quote = quoteJson['Global Quote'];
  if (!quote || !quote['05. price']) {
    throw new Error(`No data found for ticker "${symbol}". Check the symbol and try again.`);
  }

  const data = {
    ticker: quote['01. symbol'] || symbol,
    name:   overviewJson['Name'] || symbol,
    price:  parseFloat(quote['05. price']),
  };

  _lookupCache.set(symbol, { data, expiresAt: Date.now() + LOOKUP_TTL_MS });
  return data;
}

module.exports = { fetchPrice, fetchStockPrice, fetchCryptoPrice, fetchStockInfo };
