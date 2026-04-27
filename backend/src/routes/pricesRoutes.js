'use strict';

const { Router } = require('express');
const { query }  = require('express-validator');
const validate   = require('../middlewares/validate');
const { getPriceHistory, getPortfolioHistory, getPortfolioHistoryMxn } = require('../controllers/pricesController');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const dateRange = [
  query('from').optional().matches(DATE_RE).withMessage('from must be YYYY-MM-DD'),
  query('to').optional().matches(DATE_RE).withMessage('to must be YYYY-MM-DD'),
  validate,
];

// ── /api/prices ───────────────────────────────────────────────────────────────
const pricesRouter = Router();

// GET /api/prices/history?symbol=AAPL&from=&to=
pricesRouter.get(
  '/history',
  [
    query('symbol').trim().notEmpty().withMessage('symbol is required'),
    ...dateRange,
  ],
  getPriceHistory
);

// ── /api/portfolio ────────────────────────────────────────────────────────────
const portfolioRouter = Router();

// GET /api/portfolio/history?from=&to=
portfolioRouter.get('/history', dateRange, getPortfolioHistory);

// GET /api/portfolio/history/mxn?from=&to=
portfolioRouter.get('/history/mxn', dateRange, getPortfolioHistoryMxn);

module.exports = { pricesRouter, portfolioRouter };
