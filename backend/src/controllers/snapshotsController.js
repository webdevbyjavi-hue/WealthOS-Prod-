'use strict';

/**
 * snapshotsController.js
 * ──────────────────────
 * Handler for the manual snapshot trigger endpoint.
 *
 *   POST /api/snapshots/run
 *     Runs the daily snapshot job immediately for all tracked assets.
 *     Protected — requires a valid Bearer JWT.
 *     Designed for admin/testing use; the cron job calls snapshotService directly.
 *
 * @auth Required — Bearer JWT (any authenticated user can trigger a manual run)
 * @returns 200 {
 *   success: true,
 *   data: {
 *     date:      "YYYY-MM-DD",
 *     total:     number,
 *     succeeded: number,
 *     failed:    number,
 *     results:   [{ asset_id, ticker, status, date?, error? }]
 *   }
 * }
 */

const { runSnapshots } = require('../services/snapshotService');

async function triggerRun(req, res, next) {
  try {
    console.log(`[snapshotsController] Manual snapshot run triggered by user ${req.user.id}`);
    const result = await runSnapshots();
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = { triggerRun };
