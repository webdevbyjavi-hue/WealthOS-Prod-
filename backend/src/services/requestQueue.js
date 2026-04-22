'use strict';

/**
 * requestQueue.js
 * ───────────────
 * Singleton rate-limit queue for all TwelveData API calls.
 *
 * Replaces the two ad-hoc sleep delays previously in backfillService and
 * snapshotService with a single shared budget tracker.
 *
 * Priority levels:
 *   'high'   — nightly snapshot job. Items are front-queued (after any
 *               already-running high items) so backfill never starves the
 *               nightly job.
 *   'normal' — backfill jobs. Appended to the back of the queue.
 *
 * Rate limits (TwelveData free tier):
 *   8 credits/minute, 800 credits/day.
 *   Each symbol in a /quote batch, or each /time_series call, costs 1 credit.
 *
 * 429 handling:
 *   Exponential backoff — 60 s → 120 s → 240 s → 300 s cap, max 3 retries.
 *   After 3 failures the item is rejected and its error is logged.
 *   Errors are never silently swallowed.
 */

const CREDITS_PER_MINUTE = parseInt(process.env.TD_CREDITS_PER_MINUTE || '8',   10);
const CREDITS_PER_DAY    = parseInt(process.env.TD_CREDITS_PER_DAY    || '800', 10);
const DAY_SAFETY_BUFFER  = 10;   // reserve last 10 credits to protect the nightly job
const MAX_RETRIES        = 3;

// item shape: { fn, creditCost, priority, resolve, reject }
const _queue = [];
let _running       = false;
let _minuteCredits = 0;
let _dayCredits    = 0;
let _minuteStart   = Date.now();
let _currentDay    = _todayStr();

function _todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function _sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function _resetCounters() {
  const today = _todayStr();
  if (today !== _currentDay) {
    _currentDay    = today;
    _dayCredits    = 0;
    console.log('[requestQueue] UTC day rolled over — daily credit counter reset.');
  }
  if (Date.now() - _minuteStart >= 60_000) {
    _minuteStart   = Date.now();
    _minuteCredits = 0;
  }
}

async function _drain() {
  if (_running) return;
  _running = true;

  try {
    while (_queue.length > 0) {
      _resetCounters();

      const item = _queue[0];

      // ── Day budget ──────────────────────────────────────────────────────────
      if (_dayCredits + item.creditCost > CREDITS_PER_DAY - DAY_SAFETY_BUFFER) {
        if (item.priority === 'normal') {
          _queue.shift();
          const msg = `[requestQueue] Daily credit limit reached — backfill deferred to tomorrow.`;
          console.warn(msg);
          item.reject(new Error(msg));
          continue;
        }
        // HIGH priority (nightly job) gets through regardless
        console.warn('[requestQueue] Day budget near limit — HIGH priority item proceeding anyway.');
      }

      // ── Minute budget ───────────────────────────────────────────────────────
      if (_minuteCredits + item.creditCost > CREDITS_PER_MINUTE) {
        const elapsed = Date.now() - _minuteStart;
        const waitMs  = Math.max(0, 60_000 - elapsed) + 200; // +200 ms buffer
        console.log(`[requestQueue] Minute limit (${_minuteCredits}/${CREDITS_PER_MINUTE} credits) — waiting ${waitMs} ms.`);
        await _sleep(waitMs);
        _minuteStart   = Date.now();
        _minuteCredits = 0;
        continue; // re-check after reset
      }

      _queue.shift();

      // ── Execute with exponential backoff on 429 ─────────────────────────────
      let retryDelay = 60_000;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const result = await item.fn();
          _minuteCredits += item.creditCost;
          _dayCredits    += item.creditCost;
          item.resolve(result);
          break;
        } catch (err) {
          const is429 = err.status === 429 || String(err.message).includes('429');
          if (is429 && attempt < MAX_RETRIES) {
            console.warn(
              `[requestQueue] 429 received — backing off ${retryDelay / 1000}s ` +
              `(attempt ${attempt + 1}/${MAX_RETRIES}).`
            );
            await _sleep(retryDelay);
            retryDelay = Math.min(retryDelay * 2, 300_000);
          } else {
            console.error(
              `[requestQueue] Request failed after ${attempt + 1} attempt(s): ${err.message}`
            );
            item.reject(err);
            break;
          }
        }
      }
    }
  } finally {
    _running = false;
  }
}

/**
 * Add an API call to the rate-limited queue.
 *
 * @param {() => Promise<any>} fn              — Async function wrapping the API call.
 * @param {object}             [options]
 * @param {'high'|'normal'}    [options.priority='normal']  — HIGH front-queues (nightly job).
 * @param {number}             [options.creditCost=1]       — Credits this call consumes.
 * @returns {Promise<any>}   Resolves/rejects when the call completes (after retries).
 */
function enqueue(fn, { priority = 'normal', creditCost = 1 } = {}) {
  return new Promise((resolve, reject) => {
    const item = { fn, creditCost, priority, resolve, reject };

    if (priority === 'high') {
      // Insert after the last HIGH item — FIFO within priority level
      let insertAt = 0;
      for (let i = _queue.length - 1; i >= 0; i--) {
        if (_queue[i].priority === 'high') {
          insertAt = i + 1;
          break;
        }
      }
      _queue.splice(insertAt, 0, item);
    } else {
      _queue.push(item);
    }

    setImmediate(_drain);
  });
}

/** Snapshot of current queue depth (for logging/monitoring). */
function depth() {
  return {
    total:  _queue.length,
    high:   _queue.filter((i) => i.priority === 'high').length,
    normal: _queue.filter((i) => i.priority === 'normal').length,
  };
}

module.exports = { enqueue, depth };
