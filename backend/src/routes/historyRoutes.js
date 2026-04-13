'use strict';

const { Router } = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../middlewares/validate');
const { listEvents, createEvent, deleteEvent, clearHistory } = require('../controllers/historyController');

const router = Router();

const eventRules = [
  body('type').trim().notEmpty().withMessage('type is required.'),
  body('category')
    .isIn(['Investment', 'Account', 'Transaction'])
    .withMessage("category must be 'Investment', 'Account', or 'Transaction'."),
  body('title').trim().notEmpty().withMessage('title is required.'),
  body('amount').optional({ nullable: true }).isFloat().withMessage('amount must be a number.'),
];

const paginationRules = [
  query('limit').optional().isInt({ min: 1, max: 500 }).withMessage('limit must be between 1 and 500.'),
  query('offset').optional().isInt({ min: 0 }).withMessage('offset must be a non-negative integer.'),
  query('category')
    .optional()
    .isIn(['Investment', 'Account', 'Transaction'])
    .withMessage("category must be 'Investment', 'Account', or 'Transaction'."),
];

router.get('/', [...paginationRules, validate], listEvents);
router.post('/', [...eventRules, validate], createEvent);
router.delete('/', clearHistory);
router.delete(
  '/:id',
  [param('id').isUUID().withMessage('id must be a valid UUID.'), validate],
  deleteEvent
);

module.exports = router;
