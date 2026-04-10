'use strict';

const { Router } = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../middlewares/validate');
const {
  listPortfolios,
  createPortfolio,
  deletePortfolio,
  listPortfolioAssets,
  addPortfolioAsset,
  removePortfolioAsset,
  getPortfolioHistory,
} = require('../controllers/portfoliosController');

const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const portfolioIdParam = [
  param('id').isUUID().withMessage('Portfolio id must be a valid UUID'),
  validate,
];

const dateRangeQuery = [
  query('from').optional().matches(DATE_RE).withMessage('from must be YYYY-MM-DD'),
  query('to').optional().matches(DATE_RE).withMessage('to must be YYYY-MM-DD'),
  validate,
];

// ── Portfolio CRUD ────────────────────────────────────────────────────────────

// GET /api/portfolios
router.get('/', listPortfolios);

// POST /api/portfolios
router.post(
  '/',
  [body('name').trim().notEmpty().withMessage('name is required'), validate],
  createPortfolio
);

// DELETE /api/portfolios/:id
router.delete('/:id', portfolioIdParam, deletePortfolio);

// ── Portfolio asset management ────────────────────────────────────────────────

// GET /api/portfolios/:id/assets
router.get('/:id/assets', portfolioIdParam, listPortfolioAssets);

// POST /api/portfolios/:id/assets
router.post(
  '/:id/assets',
  [
    ...portfolioIdParam,
    body('asset_id').isUUID().withMessage('asset_id must be a valid UUID'),
    body('quantity')
      .isFloat({ min: 0 })
      .withMessage('quantity must be a non-negative number'),
    body('average_buy_price')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('average_buy_price must be a non-negative number'),
    validate,
  ],
  addPortfolioAsset
);

// DELETE /api/portfolios/:id/assets/:assetId
router.delete(
  '/:id/assets/:assetId',
  [
    param('id').isUUID().withMessage('Portfolio id must be a valid UUID'),
    param('assetId').isUUID().withMessage('assetId must be a valid UUID'),
    validate,
  ],
  removePortfolioAsset
);

// ── Analytics ─────────────────────────────────────────────────────────────────

// GET /api/portfolios/:id/history?from=&to=
router.get('/:id/history', [...portfolioIdParam, ...dateRangeQuery], getPortfolioHistory);

module.exports = router;
