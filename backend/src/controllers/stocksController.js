'use strict';

/**
 * stocksController.js
 * ────────────────────
 * Custom CRUD controller for the `stocks` table.
 *
 * The client always sends USD values (avg_cost, current_price).
 * This controller converts them to MXN using the cached exchange rate
 * and writes the full set of columns:
 *
 *   avg_cost         — avg cost in MXN  (main value, overwritten from USD input)
 *   current_price    — current price in MXN  (main value, overwritten from USD input)
 *   avg_cost_usd     — avg cost in USD  (raw client value, kept for reference)
 *   current_price_usd— current price in USD  (raw client value, kept for reference)
 *   tipo_de_cambio   — USD/MXN rate used for the conversion
 */

const { supabaseAdmin: supabase } = require('../services/supabaseClient');
const { getOrFetchTodayRate }     = require('../services/exchangeRateService');
const { linkHoldingToAsset }      = require('../services/assetLinker');

/** Round to 2 decimal places. */
const round4 = (n) => Math.round(n * 100) / 100;

/**
 * Fetch the exchange rate and convert current_price from USD to MXN.
 * avg_cost is user-entered in MXN and is stored as-is — no conversion applied.
 *
 * @param {number} currentPriceUsd — current_price sent by the client (USD, from Twelve Data lookup)
 * @returns {Promise<object>} — columns to merge into the payload
 */
async function buildCurrencyFields(currentPriceUsd) {
  try {
    const { rate } = await getOrFetchTodayRate();
    return {
      current_price_usd: currentPriceUsd,
      current_price:     round4(currentPriceUsd * rate),
      tipo_de_cambio:    rate,
    };
  } catch (err) {
    console.warn('[stocksController] Could not compute MXN fields:', err.message);
    return {
      current_price_usd: currentPriceUsd,
      current_price:     null,
      tipo_de_cambio:    null,
    };
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
    const { current_price } = req.body;
    // avg_cost is user-entered in MXN — stored as-is, no conversion.
    // current_price comes from the Twelve Data lookup in USD — converted to MXN.
    const currency = await buildCurrencyFields(parseFloat(current_price) || 0);

    const payload = {
      ...req.body,
      ...currency,  // overwrites current_price with MXN value and adds _usd columns
      user_id: req.user.id,
    };

    const { data, error } = await supabase
      .from('stocks')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;

    // Fire-and-forget: link to the assets time-series table and schedule backfill.
    // setImmediate ensures the HTTP response is sent before this runs.
    setImmediate(() => {
      linkHoldingToAsset({
        userId:       req.user.id,
        ticker:       data.ticker,
        name:         data.name,
        assetType:    'stock',
        currency:     'USD',
        purchaseDate: req.body.purchase_date || null,
        quantity:     parseFloat(data.shares)       || null,
        avgBuyPrice:  parseFloat(data.avg_cost_usd) || null,
      });
    });

    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ─── PUT /api/stocks/:id ──────────────────────────────────────────────────────
async function update(req, res, next) {
  try {
    const { id } = req.params;

    // Fetch existing USD current_price as fallback when the client omits it.
    const { data: existing, error: fetchErr } = await supabase
      .from('stocks')
      .select('current_price_usd')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ success: false, message: 'Record not found.' });

    // avg_cost is user-entered in MXN — stored as-is, no conversion.
    // current_price comes from the Twelve Data lookup in USD — converted to MXN.
    const currentPriceUsd = parseFloat(req.body.current_price ?? existing.current_price_usd);
    const currency = await buildCurrencyFields(currentPriceUsd);

    const updates = {
      ...req.body,
      ...currency,  // overwrites current_price with MXN and adds _usd columns
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
