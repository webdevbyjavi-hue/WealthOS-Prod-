'use strict';

const { getOrFetchTodayRate } = require('../services/exchangeRateService');

/**
 * GET /api/exchange-rates/usd-mxn
 *
 * Returns the current USD → MXN exchange rate.
 * Reads from the Supabase cache first; only calls Twelve Data
 * if today's rate hasn't been cached yet.
 *
 * Response:
 *   { success: true, data: { date, pair, rate, cached } }
 */
async function getUsdMxn(req, res, next) {
  try {
    const result = await getOrFetchTodayRate();
    res.json({
      success: true,
      data: {
        date:   result.date,
        pair:   'USD/MXN',
        rate:   result.rate,
        cached: result.cached,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getUsdMxn };
