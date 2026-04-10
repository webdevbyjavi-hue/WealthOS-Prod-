'use strict';

const { fetchStockInfo } = require('../services/priceService');

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

module.exports = { lookupTicker };
