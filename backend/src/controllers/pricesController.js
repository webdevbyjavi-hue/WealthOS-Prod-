'use strict';

/**
 * pricesController.js
 * ────────────────────
 * Handlers for the shared price history and portfolio trendline endpoints.
 *
 *   GET /api/prices/history?symbol=AAPL&from=YYYY-MM-DD&to=YYYY-MM-DD
 *     Returns daily OHLCV rows from stocks_snapshot for a single symbol.
 *     Symbol must be in TwelveData format: 'AAPL', 'BTC/USD', 'FUNO11.MX'
 *
 *   GET /api/portfolio/history?from=YYYY-MM-DD&to=YYYY-MM-DD
 *     Returns [{ date, total_value }] for the authenticated user — the sum of
 *     all stock/fibra/crypto holdings valued at daily close, derived at read
 *     time by the portfolio_daily_value view.
 *
 * Both endpoints require a valid Bearer JWT (applied at the route level).
 */

const { supabaseAdmin: supabase } = require('../services/supabaseClient');

function _daysAgo(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function _todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

// ─── GET /api/prices/history ──────────────────────────────────────────────────

/**
 * @auth   Required — Bearer JWT
 * @query  symbol  TwelveData-formatted symbol (required)
 * @query  from    Start date YYYY-MM-DD, default 90 days ago
 * @query  to      End date YYYY-MM-DD, default today
 * @returns 200 { success: true, data: [{ date, open, high, low, close, volume }] }
 * @returns 400 if symbol is missing
 */
async function getPriceHistory(req, res, next) {
  try {
    const { symbol } = req.query;
    const from = req.query.from || _daysAgo(90);
    const to   = req.query.to   || _todayUTC();

    const { data, error } = await supabase
      .from('stocks_snapshot')
      .select('date, open, high, low, close, volume')
      .eq('symbol', symbol.toUpperCase())
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true });

    if (error) throw error;

    const history = (data || []).map((r) => ({
      date:   r.date,
      open:   r.open   != null ? parseFloat(r.open)   : null,
      high:   r.high   != null ? parseFloat(r.high)   : null,
      low:    r.low    != null ? parseFloat(r.low)    : null,
      close:  parseFloat(r.close),
      volume: r.volume != null ? parseFloat(r.volume) : null,
    }));

    res.json({ success: true, data: history });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/portfolio/history ───────────────────────────────────────────────

/**
 * @auth   Required — Bearer JWT
 * @query  from  Start date YYYY-MM-DD, default 90 days ago
 * @query  to    End date YYYY-MM-DD, default today
 * @returns 200 { success: true, data: [{ date, total_value }] }
 *
 * total_value = SUM(shares × close) across all stocks + fibras + crypto for
 * the authenticated user, computed at read time by the portfolio_daily_value view.
 */
async function getPortfolioHistory(req, res, next) {
  try {
    const from   = req.query.from || _daysAgo(90);
    const to     = req.query.to   || _todayUTC();
    const userId = req.user.id;

    const { data, error } = await supabase
      .from('portfolio_daily_value')
      .select('date, total_value')
      .eq('user_id', userId)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true });

    if (error) throw error;

    const history = (data || []).map((r) => ({
      date:        r.date,
      total_value: parseFloat(r.total_value),
    }));

    res.json({ success: true, data: history });
  } catch (err) {
    next(err);
  }
}

module.exports = { getPriceHistory, getPortfolioHistory };
