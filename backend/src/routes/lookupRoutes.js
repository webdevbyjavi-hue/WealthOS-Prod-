'use strict';

const { Router } = require('express');
const { lookupTicker } = require('../controllers/lookupController');

const router = Router();

// GET /api/lookup/ticker/:ticker  →  { ticker, name, price }
router.get('/ticker/:ticker', lookupTicker);

module.exports = router;
