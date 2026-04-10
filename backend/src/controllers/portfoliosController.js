'use strict';

/**
 * portfoliosController.js
 * ───────────────────────
 * CRUD for portfolios and the portfolio history analytics endpoint.
 *
 * Endpoints:
 *   GET    /api/portfolios                     — list user's portfolios
 *   POST   /api/portfolios                     — create a portfolio
 *   DELETE /api/portfolios/:id                 — delete a portfolio (cascade)
 *   GET    /api/portfolios/:id/assets          — list assets in a portfolio
 *   POST   /api/portfolios/:id/assets          — add asset to portfolio
 *   DELETE /api/portfolios/:id/assets/:assetId — remove asset from portfolio
 *   GET    /api/portfolios/:id/history         — daily total value over a date range
 *
 * GET /api/portfolios/:id/history
 * @auth   Required — Bearer JWT
 * @param  id    Portfolio UUID (path param)
 * @param  from  Start date inclusive, default 90 days ago (query param YYYY-MM-DD)
 * @param  to    End date inclusive, default today (query param YYYY-MM-DD)
 * @returns 200 {
 *   success: true,
 *   data: {
 *     portfolio: { id, name },
 *     history:   [{ date: "YYYY-MM-DD", value: number }, ...]
 *   }
 * }
 *
 * The daily portfolio value is computed as:
 *   SUM(portfolio_assets.quantity × asset_snapshots.close)
 * for every asset in the portfolio that has a snapshot for that day.
 * Days where any asset is missing a snapshot are omitted (not zero-filled)
 * to avoid misleading dips in the chart.
 */

const { supabaseAdmin: supabase } = require('../services/supabaseClient');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysAgo(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Verify the authenticated user owns portfolio `id`.
 * Returns the portfolio row or null.
 */
async function resolvePortfolio(portfolioId, userId) {
  const { data, error } = await supabase
    .from('portfolios')
    .select('id, name, created_at')
    .eq('id', portfolioId)
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;
  return data;
}

// ─── List portfolios ──────────────────────────────────────────────────────────

/**
 * GET /api/portfolios
 * @auth Required
 */
async function listPortfolios(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('portfolios')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ─── Create portfolio ─────────────────────────────────────────────────────────

/**
 * POST /api/portfolios
 * @auth Required
 * Body: { name }
 */
async function createPortfolio(req, res, next) {
  try {
    const { name } = req.body;

    const { data, error } = await supabase
      .from('portfolios')
      .insert({ user_id: req.user.id, name })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ─── Delete portfolio ─────────────────────────────────────────────────────────

/**
 * DELETE /api/portfolios/:id
 * @auth Required
 * Cascades to portfolio_assets via FK ON DELETE CASCADE.
 */
async function deletePortfolio(req, res, next) {
  try {
    const { id } = req.params;

    const { error, count } = await supabase
      .from('portfolios')
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('user_id', req.user.id);

    if (error) throw error;
    if (count === 0) {
      return res.status(404).json({ success: false, message: 'Portfolio not found.' });
    }

    res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
}

// ─── List portfolio assets ────────────────────────────────────────────────────

/**
 * GET /api/portfolios/:id/assets
 * @auth Required
 * Returns the portfolio_assets join rows with asset details joined.
 */
async function listPortfolioAssets(req, res, next) {
  try {
    const { id } = req.params;

    const portfolio = await resolvePortfolio(id, req.user.id);
    if (!portfolio) {
      return res.status(404).json({ success: false, message: 'Portfolio not found.' });
    }

    const { data, error } = await supabase
      .from('portfolio_assets')
      .select('id, quantity, average_buy_price, added_at, assets(id, ticker, name, asset_type, currency)')
      .eq('portfolio_id', id)
      .order('added_at', { ascending: true });

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ─── Add asset to portfolio ───────────────────────────────────────────────────

/**
 * POST /api/portfolios/:id/assets
 * @auth Required
 * Body: { asset_id, quantity, average_buy_price? }
 */
async function addPortfolioAsset(req, res, next) {
  try {
    const { id } = req.params;
    const { asset_id, quantity, average_buy_price } = req.body;

    const portfolio = await resolvePortfolio(id, req.user.id);
    if (!portfolio) {
      return res.status(404).json({ success: false, message: 'Portfolio not found.' });
    }

    const { data, error } = await supabase
      .from('portfolio_assets')
      .insert({ portfolio_id: id, asset_id, quantity, average_buy_price: average_buy_price ?? null })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ─── Remove asset from portfolio ─────────────────────────────────────────────

/**
 * DELETE /api/portfolios/:id/assets/:assetId
 * @auth Required
 */
async function removePortfolioAsset(req, res, next) {
  try {
    const { id, assetId } = req.params;

    const portfolio = await resolvePortfolio(id, req.user.id);
    if (!portfolio) {
      return res.status(404).json({ success: false, message: 'Portfolio not found.' });
    }

    const { error, count } = await supabase
      .from('portfolio_assets')
      .delete({ count: 'exact' })
      .eq('portfolio_id', id)
      .eq('asset_id', assetId);

    if (error) throw error;
    if (count === 0) {
      return res.status(404).json({ success: false, message: 'Asset not in this portfolio.' });
    }

    res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/portfolios/:id/history ─────────────────────────────────────────

/**
 * @auth   Required — Bearer JWT
 * @param  id    Portfolio UUID (path param)
 * @param  from  YYYY-MM-DD (query), default 90 days ago
 * @param  to    YYYY-MM-DD (query), default today
 * @returns 200 { success: true, data: { portfolio, history: [{ date, value }] } }
 *
 * Algorithm:
 *   1. Load all portfolio_assets (asset_id + quantity)
 *   2. Load all asset_snapshots for those assets over the date range
 *   3. Group by date; for each date sum quantity × close across all assets
 *   4. Only emit a day if every portfolio asset has a snapshot for that day
 *      (prevents misleading partial-data dips)
 */
async function getPortfolioHistory(req, res, next) {
  try {
    const { id } = req.params;
    const from = req.query.from || daysAgo(90);
    const to   = req.query.to   || new Date().toISOString().slice(0, 10);

    const portfolio = await resolvePortfolio(id, req.user.id);
    if (!portfolio) {
      return res.status(404).json({ success: false, message: 'Portfolio not found.' });
    }

    // 1. Load portfolio positions
    const { data: positions, error: posErr } = await supabase
      .from('portfolio_assets')
      .select('asset_id, quantity')
      .eq('portfolio_id', id);

    if (posErr) throw posErr;

    if (!positions || positions.length === 0) {
      return res.json({ success: true, data: { portfolio, history: [] } });
    }

    const assetIds = positions.map((p) => p.asset_id);
    const quantityMap = Object.fromEntries(positions.map((p) => [p.asset_id, parseFloat(p.quantity)]));

    // 2. Load snapshots for all assets in the date range
    const { data: snapshots, error: snapErr } = await supabase
      .from('asset_snapshots')
      .select('asset_id, date, close')
      .in('asset_id', assetIds)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true });

    if (snapErr) throw snapErr;

    if (!snapshots || snapshots.length === 0) {
      return res.json({ success: true, data: { portfolio, history: [] } });
    }

    // 3. Group by date → { date → { asset_id → close } }
    const byDate = {};
    for (const s of snapshots) {
      if (!byDate[s.date]) byDate[s.date] = {};
      byDate[s.date][s.asset_id] = parseFloat(s.close);
    }

    // 4. Compute daily total — only for dates where all assets have a snapshot
    const history = [];
    for (const [date, closes] of Object.entries(byDate).sort()) {
      const hasAllAssets = assetIds.every((aid) => closes[aid] != null);
      if (!hasAllAssets) continue;

      const value = assetIds.reduce((sum, aid) => sum + quantityMap[aid] * closes[aid], 0);
      history.push({ date, value: Math.round(value * 100) / 100 });
    }

    res.json({ success: true, data: { portfolio, history } });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listPortfolios,
  createPortfolio,
  deletePortfolio,
  listPortfolioAssets,
  addPortfolioAsset,
  removePortfolioAsset,
  getPortfolioHistory,
};
