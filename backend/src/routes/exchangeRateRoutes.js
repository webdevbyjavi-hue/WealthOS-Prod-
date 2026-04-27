'use strict';

const express = require('express');
const { getUsdMxn, getUsdMxnForDate } = require('../controllers/exchangeRateController');

const router = express.Router();

// GET /api/exchange-rates/usd-mxn
router.get('/usd-mxn', getUsdMxn);

// GET /api/exchange-rates/usd-mxn/:date  (YYYY-MM-DD)
router.get('/usd-mxn/:date', getUsdMxnForDate);

module.exports = router;
