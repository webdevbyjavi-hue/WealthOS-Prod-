'use strict';

const { Router } = require('express');
const { lookupTicker, lookupFibra, lookupCrypto } = require('../controllers/lookupController');

const router = Router();

// GET /api/lookup/ticker/:ticker  →  { ticker, name, price }
router.get('/ticker/:ticker', lookupTicker);

// GET /api/lookup/fibra/:ticker   →  { ticker, name, price } (BMV-listed fibras)
router.get('/fibra/:ticker', lookupFibra);

// GET /api/lookup/crypto/:symbol  →  { symbol, name, price } (price in USD)
router.get('/crypto/:symbol', lookupCrypto);

module.exports = router;
