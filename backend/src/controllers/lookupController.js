'use strict';

const { fetchStockInfo, fetchCryptoInfo } = require('../services/priceService');

/**
 * GET /api/lookup/ticker/:ticker
 *
 * Returns { ticker, name, price } for a given stock symbol.
 * Uses Alpha Vantage GLOBAL_QUOTE + OVERVIEW in parallel, cached 5 min.
 */
async function lookupTicker(req, res, next) {
  try {
    const ticker = (req.params.ticker || '').trim().toUpperCase();
    if (!ticker) {
      return res.status(400).json({ success: false, error: 'ticker is required.' });
    }

    const info = await fetchStockInfo(ticker);
    if (!info) {
      return res.status(503).json({
        success: false,
        error: 'Price API is not configured on the server.',
      });
    }

    res.json({ success: true, data: info });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/lookup/fibra/:ticker
 *
 * Returns { ticker, name, price } for a BMV-listed Fibra.
 * Tries the raw ticker first; if Twelve Data returns no data, appends ":BMV".
 */
async function lookupFibra(req, res, next) {
  try {
    const ticker = (req.params.ticker || '').trim().toUpperCase();
    if (!ticker) {
      return res.status(400).json({ success: false, error: 'ticker is required.' });
    }

    let info = await fetchStockInfo(ticker);
    if (!info) {
      return res.status(503).json({ success: false, error: 'Price API is not configured on the server.' });
    }

    // Normalise: return the clean ticker the user typed, not the exchange-suffixed one
    info = { ...info, ticker };
    res.json({ success: true, data: info });
  } catch (err) {
    // Retry with :BMV exchange suffix if the plain ticker was not found
    const ticker = (req.params.ticker || '').trim().toUpperCase();
    try {
      const info = await fetchStockInfo(`${ticker}:BMV`);
      if (!info) return next(err);
      res.json({ success: true, data: { ...info, ticker } });
    } catch {
      next(err);
    }
  }
}

/**
 * GET /api/lookup/crypto/:symbol
 *
 * Returns { symbol, name, price } for a cryptocurrency (price in USD).
 */
async function lookupCrypto(req, res, next) {
  try {
    const symbol = (req.params.symbol || '').trim().toUpperCase();
    if (!symbol) {
      return res.status(400).json({ success: false, error: 'symbol is required.' });
    }

    const info = await fetchCryptoInfo(symbol);
    if (!info) {
      return res.status(503).json({ success: false, error: 'Price API is not configured on the server.' });
    }

    res.json({ success: true, data: info });
  } catch (err) {
    next(err);
  }
}

module.exports = { lookupTicker, lookupFibra, lookupCrypto };
