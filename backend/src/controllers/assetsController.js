'use strict';

/**
 * assetsController.js
 * ───────────────────
 * Handlers for the time-series / analytics endpoints:
 *
 *   GET /api/assets/:id/history
 *     Query params: from (YYYY-MM-DD), to (YYYY-MM-DD)
 *     Returns daily { date, value } close prices for a single asset.
 *
 *   GET /api/assets/:id/history/export
 *     Same range query params but streams the result as a CSV file download.
 *
 *   GET /api/assets/:id/performance
 *     Returns % change over the last 7d, 30d, 90d, and 1y windows.
 *
 * All endpoints require the caller to own the asset (enforced via RLS on
 * Supabase + explicit user_id check before reading snapshots).
 *
 * Response format for history / performance endpoints uses arrays of
 * { date, value } objects so they can be dropped directly into Recharts,
 * Chart.js, or Tremor without any client-side transformation.
 */

const { supabaseAdmin: supabase } = require('../services/supabaseClient');
const { scheduleBackfill }        = require('../services/backfillService');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Verify the authenticated user owns asset `id`.
 * Returns the asset row on success, null on 404/mismatch.
 */
async function resolveAsset(assetId, userId) {
  const { data, error } = await supabase
    .from('assets')
    .select('id, ticker, name, asset_type, currency, purchase_date, quantity, avg_buy_price')
    .eq('id', assetId)
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;
  return data;
}

/**
 * Subtract `days` calendar days from today and return a UTC DATE string.
 */
function daysAgo(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Round a number to 4 decimal places (sufficient for % changes).
 */
function round4(n) {
  return Math.round(n * 10000) / 10000;
}

// ─── GET /api/assets/:id/history ─────────────────────────────────────────────

/**
 * @auth   Required — Bearer JWT
 * @param  id    Asset UUID (path param)
 * @param  from  Start date inclusive, default: 90 days ago (query param YYYY-MM-DD)
 * @param  to    End date inclusive, default: today (query param YYYY-MM-DD)
 * @returns 200 {
 *   success: true,
 *   data: { asset: {...}, history: [{ date: "YYYY-MM-DD", value: number }, ...] }
 * }
 * @returns 404 if asset not found or not owned by caller
 */
async function getHistory(req, res, next) {
  try {
    const { id } = req.params;
    const from = req.query.from || daysAgo(90);
    const to   = req.query.to   || new Date().toISOString().slice(0, 10);

    const asset = await resolveAsset(id, req.user.id);
    if (!asset) {
      return res.status(404).json({ success: false, message: 'Asset not found.' });
    }

    const { data: snapshots, error } = await supabase
      .from('asset_snapshots')
      .select('date, open, high, low, close, volume, market_cap')
      .eq('asset_id', id)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true });

    if (error) throw error;

    const history = (snapshots || []).map((s) => ({
      date:       s.date,
      value:      parseFloat(s.close),
      open:       s.open       != null ? parseFloat(s.open)       : null,
      high:       s.high       != null ? parseFloat(s.high)       : null,
      low:        s.low        != null ? parseFloat(s.low)        : null,
      volume:     s.volume     != null ? parseFloat(s.volume)     : null,
      market_cap: s.market_cap != null ? parseFloat(s.market_cap) : null,
    }));

    res.json({ success: true, data: { asset, history } });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/assets/:id/history/export ──────────────────────────────────────

/**
 * @auth   Required — Bearer JWT
 * @param  id    Asset UUID (path param)
 * @param  from  Start date inclusive (query param YYYY-MM-DD)
 * @param  to    End date inclusive (query param YYYY-MM-DD)
 * @returns 200  CSV file download with columns:
 *               date, open, high, low, close, volume, market_cap
 * @returns 404  if asset not found or not owned by caller
 */
async function exportHistory(req, res, next) {
  try {
    const { id } = req.params;
    const from = req.query.from || daysAgo(90);
    const to   = req.query.to   || new Date().toISOString().slice(0, 10);

    const asset = await resolveAsset(id, req.user.id);
    if (!asset) {
      return res.status(404).json({ success: false, message: 'Asset not found.' });
    }

    const { data: snapshots, error } = await supabase
      .from('asset_snapshots')
      .select('date, open, high, low, close, volume, market_cap')
      .eq('asset_id', id)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true });

    if (error) throw error;

    // Build CSV string
    const header = 'date,open,high,low,close,volume,market_cap\n';
    const rows = (snapshots || [])
      .map((s) =>
        [
          s.date,
          s.open       ?? '',
          s.high       ?? '',
          s.low        ?? '',
          s.close,
          s.volume     ?? '',
          s.market_cap ?? '',
        ].join(',')
      )
      .join('\n');

    const csv = header + rows;
    const filename = `${asset.ticker}_${from}_${to}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/assets/:id/performance ─────────────────────────────────────────

/**
 * @auth   Required — Bearer JWT
 * @param  id  Asset UUID (path param)
 * @returns 200 {
 *   success: true,
 *   data: {
 *     asset: {...},
 *     current_price: number,
 *     performance: {
 *       "7d":  { change_pct: number, from_date: string, to_date: string },
 *       "30d": { ... },
 *       "90d": { ... },
 *       "1y":  { ... },
 *     }
 *   }
 * }
 * @returns 404 if asset not found or no snapshot data available
 */
async function getPerformance(req, res, next) {
  try {
    const { id } = req.params;

    const asset = await resolveAsset(id, req.user.id);
    if (!asset) {
      return res.status(404).json({ success: false, message: 'Asset not found.' });
    }

    // We need the most recent close and closes ~7, 30, 90, 365 days ago.
    // Fetch the last 370 days so we can satisfy all windows in one query.
    const from = daysAgo(370);

    const { data: snapshots, error } = await supabase
      .from('asset_snapshots')
      .select('date, close')
      .eq('asset_id', id)
      .gte('date', from)
      .order('date', { ascending: true });

    if (error) throw error;

    if (!snapshots || snapshots.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No snapshot data available for this asset.',
      });
    }

    // Index snapshots by date for O(1) lookups
    const byDate = Object.fromEntries(snapshots.map((s) => [s.date, parseFloat(s.close)]));
    const allDates = snapshots.map((s) => s.date).sort();
    const latestDate = allDates[allDates.length - 1];
    const currentPrice = byDate[latestDate];

    /**
     * Find the closest available closing price on or before `targetDate`.
     * Returns { price, date } or null if nothing is available.
     */
    function closestBefore(targetDate) {
      const candidates = allDates.filter((d) => d <= targetDate);
      if (candidates.length === 0) return null;
      const d = candidates[candidates.length - 1];
      return { price: byDate[d], date: d };
    }

    const windows = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
    const performance = {};

    for (const [label, days] of Object.entries(windows)) {
      const target  = daysAgo(days);
      const anchor  = closestBefore(target);

      if (!anchor || anchor.price === 0) {
        performance[label] = null;
        continue;
      }

      const changePct = round4(((currentPrice - anchor.price) / anchor.price) * 100);
      performance[label] = {
        change_pct: changePct,
        from_price: anchor.price,
        from_date:  anchor.date,
        to_price:   currentPrice,
        to_date:    latestDate,
      };
    }

    res.json({
      success: true,
      data: {
        asset,
        current_price: currentPrice,
        as_of:         latestDate,
        performance,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── CRUD for assets master list ─────────────────────────────────────────────

/**
 * GET /api/assets
 * @auth Required
 * @returns All assets belonging to the authenticated user.
 */
async function listAssets(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('assets')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/assets
 * @auth Required
 * Body: { ticker, name, asset_type, currency?, purchase_date?, quantity?, avg_buy_price? }
 *
 * When purchase_date is provided the response includes `backfilling: true` and
 * a historical price backfill is scheduled asynchronously — the HTTP response
 * is returned immediately without waiting for the backfill to complete.
 */
async function createAsset(req, res, next) {
  try {
    const { ticker, name, asset_type, currency, purchase_date, quantity, avg_buy_price } = req.body;

    const { data, error } = await supabase
      .from('assets')
      .insert({
        user_id:       req.user.id,
        ticker,
        name,
        asset_type,
        currency:      currency      || 'USD',
        purchase_date: purchase_date || null,
        quantity:      quantity      || null,
        avg_buy_price: avg_buy_price || null,
      })
      .select()
      .single();

    if (error) throw error;

    const willBackfill = !!data.purchase_date;
    if (willBackfill) scheduleBackfill(data);

    res.status(201).json({ success: true, data, backfilling: willBackfill });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/assets/:id
 * @auth Required
 * Cascades to asset_snapshots and portfolio_assets automatically (FK ON DELETE CASCADE).
 */
async function deleteAsset(req, res, next) {
  try {
    const { id } = req.params;

    const { error, count } = await supabase
      .from('assets')
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('user_id', req.user.id);

    if (error) throw error;
    if (count === 0) {
      return res.status(404).json({ success: false, message: 'Asset not found.' });
    }

    res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/assets/:id/backfill ───────────────────────────────────────────

/**
 * Manually re-trigger a historical backfill for a specific asset.
 * Useful after correcting a purchase_date or if the initial backfill failed.
 *
 * @auth   Required — Bearer JWT
 * @param  id  Asset UUID (path param)
 * @returns 202 { success: true, backfilling: true }
 * @returns 400 if the asset has no purchase_date set
 * @returns 404 if asset not found or not owned by caller
 */
async function triggerBackfill(req, res, next) {
  try {
    const { id } = req.params;

    const asset = await resolveAsset(id, req.user.id);
    if (!asset) {
      return res.status(404).json({ success: false, message: 'Asset not found.' });
    }

    if (!asset.purchase_date) {
      return res.status(400).json({
        success: false,
        message: 'Asset has no purchase_date. Set one before triggering a backfill.',
      });
    }

    scheduleBackfill(asset);

    res.status(202).json({ success: true, backfilling: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getHistory,
  exportHistory,
  getPerformance,
  listAssets,
  createAsset,
  deleteAsset,
  triggerBackfill,
};
