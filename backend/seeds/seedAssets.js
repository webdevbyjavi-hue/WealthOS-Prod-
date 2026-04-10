#!/usr/bin/env node
'use strict';

/**
 * seedAssets.js
 * ─────────────
 * Populates the database with 5 sample assets and 90 days of realistic
 * mock OHLCV data per asset for development and testing.
 *
 * Usage:
 *   node backend/seeds/seedAssets.js [--user <supabase-user-uuid>]
 *
 * Options:
 *   --user <uuid>   Target user UUID. If omitted the script looks for
 *                   SEED_USER_ID in the environment.
 *
 * The script is idempotent: it upserts assets by (user_id, ticker) and
 * upserts snapshots by (asset_id, date), so re-running it is safe.
 *
 * Uses the service-role key (supabaseAdmin) to bypass RLS.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { createClient } = require('@supabase/supabase-js');

// ─── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL      = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('[seed] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in backend/.env');
  process.exit(1);
}

// Parse --user flag
const userArgIdx = process.argv.indexOf('--user');
const userId = userArgIdx !== -1
  ? process.argv[userArgIdx + 1]
  : process.env.SEED_USER_ID;

if (!userId) {
  console.error('[seed] Provide a user UUID via --user <uuid> or SEED_USER_ID env var.');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Sample assets ────────────────────────────────────────────────────────────

const ASSETS = [
  { ticker: 'AAPL',  name: 'Apple Inc.',          asset_type: 'stock',  currency: 'USD', basePrice: 185.00 },
  { ticker: 'BTC',   name: 'Bitcoin',              asset_type: 'crypto', currency: 'USD', basePrice: 67000.00 },
  { ticker: 'SPY',   name: 'SPDR S&P 500 ETF',    asset_type: 'etf',    currency: 'USD', basePrice: 520.00 },
  { ticker: 'AMZN',  name: 'Amazon.com Inc.',      asset_type: 'stock',  currency: 'USD', basePrice: 185.00 },
  { ticker: 'ETH',   name: 'Ethereum',             asset_type: 'crypto', currency: 'USD', basePrice: 3400.00 },
];

// ─── Mock OHLCV generator ─────────────────────────────────────────────────────

/**
 * Generate `days` calendar days of mock OHLCV data ending today.
 * Uses a simple geometric Brownian motion model:
 *   price[t] = price[t-1] * exp(drift + volatility * N(0,1))
 *
 * @param {number} basePrice  Starting close price
 * @param {number} days       Number of days to generate
 * @param {number} [vol=0.02] Daily volatility (default 2%)
 * @returns {Array<{ date, open, high, low, close, volume }>}
 */
function generateOHLCV(basePrice, days, vol = 0.02) {
  const DRIFT = 0.0003; // slight upward drift (~7% annualised)
  const rows  = [];
  let   price = basePrice;

  // Box-Muller transform for N(0,1) random numbers
  function randn() {
    const u = 1 - Math.random();
    const v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  for (let d = days - 1; d >= 0; d--) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - d);
    const dateStr = date.toISOString().slice(0, 10);

    // Next close via GBM
    const ret   = DRIFT + vol * randn();
    const close = Math.max(price * Math.exp(ret), 0.01);

    // Intra-day range: ±(0.5% to 1.5%) of close
    const rangePct = 0.005 + Math.random() * 0.01;
    const high  = close * (1 + rangePct);
    const low   = close * (1 - rangePct);
    const open  = low + Math.random() * (high - low);

    // Volume: base varies by asset class, add noise
    const baseVol = basePrice > 10000 ? 30000 : basePrice > 1000 ? 500000 : 50000000;
    const volume  = Math.round(baseVol * (0.7 + Math.random() * 0.6));

    rows.push({
      date:   dateStr,
      open:   Math.round(open  * 1e8) / 1e8,
      high:   Math.round(high  * 1e8) / 1e8,
      low:    Math.round(low   * 1e8) / 1e8,
      close:  Math.round(close * 1e8) / 1e8,
      volume,
    });

    price = close;
  }

  return rows;
}

// ─── Seed logic ───────────────────────────────────────────────────────────────

async function seed() {
  console.log(`[seed] Seeding for user: ${userId}`);

  for (const assetDef of ASSETS) {
    const { ticker, name, asset_type, currency, basePrice } = assetDef;

    // ── Upsert asset ────────────────────────────────────────────────────────
    const { data: asset, error: assetErr } = await admin
      .from('assets')
      .upsert(
        { user_id: userId, ticker, name, asset_type, currency },
        { onConflict: 'user_id,ticker', ignoreDuplicates: false }
      )
      .select()
      .single();

    if (assetErr) {
      console.error(`[seed] Failed to upsert asset ${ticker}:`, assetErr.message);
      continue;
    }

    console.log(`[seed] Asset: ${ticker} (${asset.id})`);

    // ── Generate 90 days of mock OHLCV ─────────────────────────────────────
    const vol = asset_type === 'crypto' ? 0.04 : 0.015; // crypto is more volatile
    const rows = generateOHLCV(basePrice, 90, vol).map((row) => ({
      ...row,
      asset_id: asset.id,
    }));

    // Upsert in batches of 50 to stay within Supabase row limits per request
    const BATCH = 50;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const { error: snapErr } = await admin
        .from('asset_snapshots')
        .upsert(batch, { onConflict: 'asset_id,date' });

      if (snapErr) {
        console.error(`[seed] Failed to upsert snapshots for ${ticker} (batch ${i / BATCH + 1}):`, snapErr.message);
      }
    }

    console.log(`[seed]   → ${rows.length} snapshots upserted for ${ticker}`);
  }

  // ── Seed a sample portfolio ──────────────────────────────────────────────
  console.log('[seed] Creating sample portfolio...');

  const { data: portfolio, error: portErr } = await admin
    .from('portfolios')
    .upsert(
      { user_id: userId, name: 'Sample Portfolio' },
      { onConflict: 'id', ignoreDuplicates: true } // won't duplicate if re-run by id conflict
    )
    .select()
    .single();

  if (portErr) {
    console.warn('[seed] Could not create sample portfolio:', portErr.message);
  } else {
    console.log(`[seed] Portfolio: ${portfolio.name} (${portfolio.id})`);

    // Load the assets we just created to get their IDs
    const { data: seededAssets } = await admin
      .from('assets')
      .select('id, ticker')
      .eq('user_id', userId)
      .in('ticker', ASSETS.map((a) => a.ticker));

    const positions = [
      { ticker: 'AAPL',  quantity: 10,   average_buy_price: 175.00 },
      { ticker: 'BTC',   quantity: 0.5,  average_buy_price: 58000.00 },
      { ticker: 'SPY',   quantity: 5,    average_buy_price: 500.00 },
      { ticker: 'AMZN',  quantity: 8,    average_buy_price: 178.00 },
      { ticker: 'ETH',   quantity: 2,    average_buy_price: 3100.00 },
    ];

    for (const pos of positions) {
      const asset = seededAssets?.find((a) => a.ticker === pos.ticker);
      if (!asset) continue;

      const { error: paErr } = await admin
        .from('portfolio_assets')
        .upsert(
          {
            portfolio_id:      portfolio.id,
            asset_id:          asset.id,
            quantity:          pos.quantity,
            average_buy_price: pos.average_buy_price,
          },
          { onConflict: 'portfolio_id,asset_id' }
        );

      if (paErr) {
        console.warn(`[seed] Could not add ${pos.ticker} to portfolio:`, paErr.message);
      } else {
        console.log(`[seed]   → Added ${pos.ticker} × ${pos.quantity} to portfolio`);
      }
    }
  }

  console.log('[seed] Done.');
}

seed().catch((err) => {
  console.error('[seed] Fatal error:', err.message);
  process.exit(1);
});
