'use strict';

/**
 * stocksController.js
 * ────────────────────
 * Custom CRUD controller for the `stocks` table.
 *
 * Extends the generic holdingsController pattern but intercepts
 * `create` and `update` to compute three MXN fields on the backend:
 *
 *   tipo_de_cambio    — USD/MXN rate fetched from the `exchange_rates` cache
 *   precio_compra_mxn — avg_cost   × tipo_de_cambio
 *   precio_actual_mxn — current_price × tipo_de_cambio
 *
 * The client never sends these fields; they are always derived here.
 */

const { supabaseAdmin: supabase } = require('../services/supabaseClient');
const { getOrFetchTodayRate }     = require('../services/exchangeRateService');

/** Round to 4 decimal places (matches NUMERIC(18,4) in the schema). */
const round4 = (n) => Math.round(n * 10000) / 10000;

/**
 * Fetch the current exchange rate and return the three computed MXN fields.
 * If the exchange rate service is unavailable, the fields are set to null
 * so the insert/update still succeeds.
 *
 * @param {number} avgCost      — avg_cost in USD
 * @param {number} currentPrice — current_price in USD
 * @returns {Promise<{ tipo_de_cambio, precio_compra_mxn, precio_actual_mxn }>}
 */
async function computeMxnFields(avgCost, currentPrice) {
  try {
    const { rate } = await getOrFetchTodayRate();
    return {
      tipo_de_cambio:    rate,
      precio_compra_mxn: round4(avgCost      * rate),
      precio_actual_mxn: round4(currentPrice * rate),
    };
  } catch (err) {
    console.warn('[stocksController] Could not compute MXN fields:', err.message);
    return { tipo_de_cambio: null, precio_compra_mxn: null, precio_actual_mxn: null };
  }
}

// ─── GET /api/stocks ──────────────────────────────────────────────────────────
async function list(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('stocks')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/stocks ─────────────────────────────────────────────────────────
async function create(req, res, next) {
  try {
    const { avg_cost, current_price } = req.body;
    const mxn = await computeMxnFields(
      parseFloat(avg_cost)      || 0,
      parseFloat(current_price) || 0
    );

    const payload = {
      ...req.body,
      ...mxn,
      user_id: req.user.id,
    };

    const { data, error } = await supabase
      .from('stocks')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ─── PUT /api/stocks/:id ──────────────────────────────────────────────────────
async function update(req, res, next) {
  try {
    const { id } = req.params;

    // Fetch the existing row so we always have both avg_cost and current_price
    // available even when only one of them changes.
    const { data: existing, error: fetchErr } = await supabase
      .from('stocks')
      .select('avg_cost, current_price')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ success: false, message: 'Record not found.' });

    const avgCost      = parseFloat(req.body.avg_cost      ?? existing.avg_cost);
    const currentPrice = parseFloat(req.body.current_price ?? existing.current_price);

    const mxn = await computeMxnFields(avgCost, currentPrice);

    const updates = {
      ...req.body,
      ...mxn,
      updated_at: new Date().toISOString(),
    };
    delete updates.user_id; // never let the caller change ownership

    const { data, error } = await supabase
      .from('stocks')
      .update(updates)
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, message: 'Record not found.' });

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ─── DELETE /api/stocks/:id ───────────────────────────────────────────────────
async function remove(req, res, next) {
  try {
    const { id } = req.params;

    const { error, count } = await supabase
      .from('stocks')
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('user_id', req.user.id);

    if (error) throw error;
    if (count === 0) return res.status(404).json({ success: false, message: 'Record not found.' });

    res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, remove };
