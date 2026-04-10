'use strict';

const { validationResult } = require('express-validator');

/**
 * Run after a chain of express-validator checks.
 * If there are errors, respond 422 with the full list; otherwise call next().
 */
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed.',
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
}

module.exports = validate;
