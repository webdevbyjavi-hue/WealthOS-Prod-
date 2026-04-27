'use strict';

const { getOrFetchTodayRate, getRateForDate } = require('../services/exchangeRateService');

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

/**
 * GET /api/exchange-rates/usd-mxn/:date
 *
 * Returns the USD → MXN rate for the given YYYY-MM-DD date.
 * Falls back to the nearest prior trading day if no rate exists for that date.
 */
async function getUsdMxnForDate(req, res, next) {
  try {
    const { date } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, message: 'date must be YYYY-MM-DD' });
    }
    const result = await getRateForDate(date);
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

module.exports = { getUsdMxn, getUsdMxnForDate };
