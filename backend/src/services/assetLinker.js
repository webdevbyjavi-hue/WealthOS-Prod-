'use strict';

/**
 * assetLinker.js
 * ──────────────
 * Links a category-holdings row (stocks / crypto / fibras) to the `assets`
 * time-series table (System B) after the holding has been saved.
 *
 * Uses upsert on (user_id, ticker) so that:
 *   • Adding AAPL as a stock always finds or creates the same `assets` row.
 *   • Re-adding an existing holding updates the purchase metadata without
 *     creating a duplicate.
 *
 * The entire function is wrapped in try/catch — it must never propagate errors
 * to the calling controller. Auto-linking is best-effort.
 */

const { supabaseAdmin } = require('./supabaseClient');
const { scheduleBackfill } = require('./backfillService');

/**
 * Link a holding to the `assets` table and schedule a historical backfill.
 *
 * @param {object} params
 * @param {string}      params.userId
 * @param {string}      params.ticker       — ticker or symbol (uppercased by caller)
 * @param {string}      params.name         — display name
 * @param {string}      params.assetType    — 'stock' | 'crypto' | 'reit' | 'etf' | ...
 * @param {string}      [params.currency]   — ISO code, default 'USD'
 * @param {string|null} [params.purchaseDate]  — YYYY-MM-DD or null
 * @param {number|null} [params.quantity]
 * @param {number|null} [params.avgBuyPrice]
 */
async function linkHoldingToAsset({
  userId,
  ticker,
  name,
  assetType,
  currency    = 'USD',
  purchaseDate = null,
  quantity     = null,
  avgBuyPrice  = null,
}) {
  try {
    const { data, error } = await supabaseAdmin
      .from('assets')
      .upsert(
        {
          user_id:       userId,
          ticker,
          name,
          asset_type:    assetType,
          currency,
          purchase_date: purchaseDate,
          quantity,
          avg_buy_price: avgBuyPrice,
        },
        {
          onConflict:       'user_id,ticker',  // matches uq_assets_user_ticker unique index
          ignoreDuplicates: false,             // DO UPDATE — merge purchase metadata
        }
      )
      .select()
      .single();

    if (error) {
      console.error(`[assetLinker] Failed to upsert asset for ${ticker}:`, error.message);
      return;
    }

    if (data.purchase_date) {
      scheduleBackfill(data);
    }
  } catch (err) {
    console.error(`[assetLinker] Unexpected error for ${ticker}:`, err.message);
  }
}

module.exports = { linkHoldingToAsset };
