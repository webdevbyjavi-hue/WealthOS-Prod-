'use strict';

const { Router } = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../middlewares/validate');
const {
  listAssets,
  createAsset,
  deleteAsset,
  getHistory,
  exportHistory,
  getPerformance,
  triggerBackfill,
} = require('../controllers/assetsController');

const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const assetIdParam = [
  param('id').isUUID().withMessage('Asset id must be a valid UUID'),
  validate,
];

const dateRangeQuery = [
  query('from')
    .optional()
    .matches(DATE_RE)
    .withMessage('from must be YYYY-MM-DD'),
  query('to')
    .optional()
    .matches(DATE_RE)
    .withMessage('to must be YYYY-MM-DD'),
  validate,
];

// ── Asset CRUD ────────────────────────────────────────────────────────────────

// GET /api/assets
router.get('/', listAssets);

// POST /api/assets
router.post(
  '/',
  [
    body('ticker')
      .trim()
      .notEmpty()
      .withMessage('ticker is required')
      .isLength({ max: 20 })
      .withMessage('ticker must be ≤ 20 characters'),
    body('name')
      .trim()
      .notEmpty()
      .withMessage('name is required'),
    body('asset_type')
      .isIn(['stock', 'crypto', 'etf', 'bond', 'reit', 'fund', 'other'])
      .withMessage('asset_type must be one of: stock, crypto, etf, bond, reit, fund, other'),
    body('currency')
      .optional()
      .trim()
      .isLength({ min: 3, max: 3 })
      .withMessage('currency must be a 3-letter ISO code'),
    body('purchase_date')
      .optional()
      .matches(DATE_RE)
      .withMessage('purchase_date must be YYYY-MM-DD'),
    body('quantity')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('quantity must be a non-negative number'),
    body('avg_buy_price')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('avg_buy_price must be a non-negative number'),
    validate,
  ],
  createAsset
);

// DELETE /api/assets/:id
router.delete('/:id', assetIdParam, deleteAsset);

// POST /api/assets/:id/backfill — manually re-trigger historical backfill
router.post('/:id/backfill', assetIdParam, triggerBackfill);

// ── Time-series endpoints ─────────────────────────────────────────────────────

// GET /api/assets/:id/history/export   (must be before /history to avoid param clash)
router.get('/:id/history/export', [...assetIdParam, ...dateRangeQuery], exportHistory);

// GET /api/assets/:id/history?from=&to=
router.get('/:id/history', [...assetIdParam, ...dateRangeQuery], getHistory);

// GET /api/assets/:id/performance
router.get('/:id/performance', assetIdParam, getPerformance);

module.exports = router;
