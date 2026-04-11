'use strict';

const express = require('express');
const { getUsdMxn } = require('../controllers/exchangeRateController');

const router = express.Router();

// GET /api/exchange-rates/usd-mxn
router.get('/usd-mxn', getUsdMxn);

module.exports = router;
