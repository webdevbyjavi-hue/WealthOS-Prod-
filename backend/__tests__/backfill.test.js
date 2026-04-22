'use strict';

/**
 * backfill.test.js
 * ────────────────
 * Proves two guarantees of the backfill system:
 *
 *   (a) End-to-end: when no data exists for a symbol, backfillSymbol()
 *       fetches from TwelveData and upserts rows into stocks_snapshot.
 *
 *   (b) Idempotency: when stocks_snapshot already covers [purchase_date, today],
 *       backfillSymbol() issues zero TwelveData API calls.
 *
 * Additionally covers symbol normalization for crypto (BTC → BTC/USD)
 * and reit/fibra (FUNO11 → FUNO11.MX).
 *
 * Mock strategy:
 *   • supabaseClient  — factory mock; supabaseAdmin.from is a jest.fn()
 *     whose return value is controlled per-test.
 *   • requestQueue    — enqueue() calls fn() directly, no rate limiting.
 *   • priceService    — fetchHistoricalTimeSeries is mocked to return FAKE_BARS;
 *     normalizeSymbol uses the REAL implementation so symbol normalization
 *     logic is exercised by the tests.
 */

// ─── Module mocks ─────────────────────────────────────────────────────────────

jest.mock('../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: jest.fn() },
}));

jest.mock('../src/services/requestQueue', () => ({
  enqueue: jest.fn((fn) => fn()),
}));

jest.mock('../src/services/priceService', () => ({
  // Use the real normalizeSymbol so we test actual symbol normalization
  normalizeSymbol:             jest.requireActual('../src/services/priceService').normalizeSymbol,
  fetchHistoricalTimeSeries:   jest.fn(),
}));

// ─── Imports (after mocks are registered) ────────────────────────────────────

const { backfillSymbol }            = require('../src/services/backfillService');
const { fetchHistoricalTimeSeries } = require('../src/services/priceService');
const { supabaseAdmin }             = require('../src/services/supabaseClient');
const { enqueue }                   = require('../src/services/requestQueue');

// ─── Test fixtures ────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10);

const FAKE_BARS = [
  { date: '2024-01-15', open: 150.0, high: 152.0, low: 149.0, close: 151.0, volume: 50_000_000 },
  { date: '2024-01-16', open: 151.0, high: 153.0, low: 150.5, close: 152.5, volume: 48_000_000 },
];

/**
 * Build a Supabase-style builder chain whose .limit() resolves with `rows`
 * and whose .upsert() resolves with { error: null }.
 */
function makeChain(rows = []) {
  const chain = {};
  ['select', 'eq', 'gte', 'lte', 'order'].forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain);
  });
  chain.limit  = jest.fn().mockResolvedValue({ data: rows, error: null });
  chain.upsert = jest.fn().mockResolvedValue({ error: null });
  return chain;
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  // Queue calls fn() immediately (no rate limiting in tests)
  enqueue.mockImplementation((fn) => fn());
  fetchHistoricalTimeSeries.mockResolvedValue(FAKE_BARS);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('backfillSymbol', () => {
  test('(a) fetches and inserts rows when no data exists for the symbol', async () => {
    // The two gap-detection queries return empty arrays (DB has no data yet).
    // The upsert call is the third from() invocation.
    let callCount = 0;
    supabaseAdmin.from.mockImplementation(() => {
      callCount++;
      return makeChain(callCount <= 2 ? [] : []);
    });

    const result = await backfillSymbol('AAPL', 'stock', '2024-01-15');

    // TwelveData was called exactly once
    expect(fetchHistoricalTimeSeries).toHaveBeenCalledTimes(1);
    expect(fetchHistoricalTimeSeries).toHaveBeenCalledWith('AAPL', 'stock', '2024-01-15', TODAY);

    // All bars were inserted
    expect(result.inserted).toBe(FAKE_BARS.length);
    expect(result.error).toBeNull();

    // Upsert was called on stocks_snapshot with the correct symbol and conflict target
    const upsertChain = supabaseAdmin.from.mock.results[2].value;
    expect(upsertChain.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ symbol: 'AAPL', date: '2024-01-15', close: 151.0 }),
        expect.objectContaining({ symbol: 'AAPL', date: '2024-01-16', close: 152.5 }),
      ]),
      { onConflict: 'symbol,date' }
    );
  });

  test('(b) skips API call when stocks_snapshot fully covers [purchase_date, today]', async () => {
    // Gap detection: first query (earliest) returns the purchase_date,
    // second (latest) returns today. Coverage is complete.
    let callCount = 0;
    supabaseAdmin.from.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return makeChain([{ date: '2024-01-15' }]); // earliest
      return makeChain([{ date: TODAY }]);                              // latest
    });

    const result = await backfillSymbol('AAPL', 'stock', '2024-01-15');

    // Zero TwelveData API calls
    expect(fetchHistoricalTimeSeries).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();

    expect(result.skipped).toBe(1);
    expect(result.inserted).toBe(0);
    expect(result.error).toBeNull();
  });

  test('normalises crypto ticker to BASE/USD in stocks_snapshot', async () => {
    let callCount = 0;
    supabaseAdmin.from.mockImplementation(() => {
      callCount++;
      return makeChain([]);
    });

    await backfillSymbol('BTC', 'crypto', '2024-01-15');

    const upsertChain = supabaseAdmin.from.mock.results[2]?.value;
    expect(upsertChain?.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ symbol: 'BTC/USD' }),
      ]),
      expect.anything()
    );
  });

  test('normalises reit (fibra) ticker to TICKER.MX in stocks_snapshot', async () => {
    let callCount = 0;
    supabaseAdmin.from.mockImplementation(() => {
      callCount++;
      return makeChain([]);
    });

    await backfillSymbol('FUNO11', 'reit', '2024-01-15');

    const upsertChain = supabaseAdmin.from.mock.results[2]?.value;
    expect(upsertChain?.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ symbol: 'FUNO11.MX' }),
      ]),
      expect.anything()
    );
  });

  test('returns early without error when purchase_date is not provided', async () => {
    const result = await backfillSymbol('AAPL', 'stock', null);

    expect(fetchHistoricalTimeSeries).not.toHaveBeenCalled();
    expect(result).toEqual({ inserted: 0, skipped: 0, error: null });
  });

  test('skips API call when purchase_date is in the future', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);
    const future = futureDate.toISOString().slice(0, 10);

    // No from() calls expected (future date check happens before DB queries)
    supabaseAdmin.from.mockImplementation(() => makeChain([]));

    const result = await backfillSymbol('AAPL', 'stock', future);

    expect(fetchHistoricalTimeSeries).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
  });
});
