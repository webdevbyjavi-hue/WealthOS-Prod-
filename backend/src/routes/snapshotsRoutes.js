'use strict';

const { Router } = require('express');
const { triggerRun } = require('../controllers/snapshotsController');

const router = Router();

// POST /api/snapshots/run
// Manually triggers the daily snapshot job.
// Protected by authMiddleware applied in server.js.
router.post('/run', triggerRun);

module.exports = router;
