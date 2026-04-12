'use strict';

const { Router } = require('express');
const { body, param } = require('express-validator');
const validate = require('../middlewares/validate');
const {
  listAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  listTransactions,
  createTransaction,
  deleteTransaction,
} = require('../controllers/accountsController');

const router = Router();

const uuidParam = param('id').isUUID().withMessage('id must be a valid UUID.');

const accountRules = [
  body('name').trim().notEmpty().withMessage('name is required.'),
  body('bank').trim().notEmpty().withMessage('bank is required.'),
  body('balance').isFloat().withMessage('balance must be a number.'),
];

const transactionRules = [
  body('type').isIn(['in', 'out', 'invested']).withMessage("type must be 'in', 'out', or 'invested'."),
  body('amount').isFloat({ min: 0.01 }).withMessage('amount must be a positive number.'),
  body('date').optional().isISO8601().withMessage('date must be a valid ISO date.'),
];

// Accounts
router.get('/', listAccounts);
router.post('/', [...accountRules, validate], createAccount);
router.put('/:id', [uuidParam, validate], updateAccount);
router.delete('/:id', [uuidParam, validate], deleteAccount);

// Transactions nested under an account
router.get('/:id/transactions', [uuidParam, validate], listTransactions);
router.post('/:id/transactions', [uuidParam, ...transactionRules, validate], createTransaction);
router.delete('/:id/transactions/:txId', [uuidParam, validate], deleteTransaction);

module.exports = router;
