'use strict';

const { Router } = require('express');
const { body } = require('express-validator');
const validate = require('../middlewares/validate');
const authMiddleware = require('../middlewares/authMiddleware');
const { signup, signin, signout, resetPassword, me } = require('../controllers/authController');

const router = Router();

const emailPasswordRules = [
  body('email').isEmail().withMessage('A valid email is required.').normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'),
];

// Public
router.post('/signup', emailPasswordRules, validate, signup);
router.post('/signin', emailPasswordRules, validate, signin);
router.post('/signout', signout);
router.post(
  '/reset-password',
  [body('email').isEmail().withMessage('A valid email is required.').normalizeEmail()],
  validate,
  resetPassword
);

// Protected
router.get('/me', authMiddleware, me);

module.exports = router;
