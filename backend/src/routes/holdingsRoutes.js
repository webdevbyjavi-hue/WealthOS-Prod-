'use strict';

/**
 * Holdings routes — one Router instance per asset category.
 *
 * All routes are protected by authMiddleware (applied in server.js at the
 * /api prefix level, so we don't repeat it here).
 *
 * Validation rules are intentionally minimal on the server: the front-end
 * already validates types; the DB schema enforces NOT NULL constraints.
 * Add stricter rules per field as the schema firms up.
 */

const { Router } = require('express');
const { body, param } = require('express-validator');
const validate = require('../middlewares/validate');
const holdingsController = require('../controllers/holdingsController');

const uuidParam = param('id').isUUID().withMessage('id must be a valid UUID.');
const positiveNumber = (field) => body(field).isFloat({ min: 0 }).withMessage(`${field} must be a non-negative number.`);

// ─── Factory ──────────────────────────────────────────────────────────────────

function buildRouter(table, createRules = []) {
  const { list, create, update, remove } = holdingsController(table);
  const router = Router();

  router.get('/', list);
  router.post('/', [...createRules, validate], create);
  router.put('/:id', [uuidParam, validate], update);
  router.delete('/:id', [uuidParam, validate], remove);

  return router;
}

// ─── Stocks  { ticker, name, shares, avg_cost, current_price } ────────────────
const stocksRules = [
  body('ticker').trim().notEmpty().withMessage('ticker is required.').toUpperCase(),
  body('name').trim().notEmpty().withMessage('name is required.'),
  positiveNumber('shares'),
  positiveNumber('avg_cost'),
  positiveNumber('current_price'),
];

// ─── Bonos  { instrumento, serie, titulos, valor_nominal, precio_compra,
//              precio_actual, tasa_cupon, rendimiento, vencimiento } ───────────
const bonosRules = [
  body('instrumento').trim().notEmpty().withMessage('instrumento is required.'),
  body('serie').trim().notEmpty().withMessage('serie is required.').toUpperCase(),
  body('titulos').isInt({ min: 1 }).withMessage('titulos must be a positive integer.'),
  positiveNumber('valor_nominal'),
  positiveNumber('precio_compra'),
  positiveNumber('precio_actual'),
  positiveNumber('rendimiento'),
  body('vencimiento').isISO8601().withMessage('vencimiento must be a valid date (YYYY-MM-DD).'),
];

// ─── Fondos  { clave, nombre, operadora, unidades, precio_compra, nav_actual,
//               rendimiento, tipo } ──────────────────────────────────────────
const fondosRules = [
  body('clave').trim().notEmpty().withMessage('clave is required.').toUpperCase(),
  body('nombre').trim().notEmpty().withMessage('nombre is required.'),
  body('operadora').trim().notEmpty().withMessage('operadora is required.'),
  positiveNumber('unidades'),
  positiveNumber('precio_compra'),
  positiveNumber('nav_actual'),
];

// ─── Fibras  { ticker, nombre, sector, certificados, precio_compra,
//               precio_actual, distribucion, rendimiento } ───────────────────
const fibrasRules = [
  body('ticker').trim().notEmpty().withMessage('ticker is required.').toUpperCase(),
  body('nombre').trim().notEmpty().withMessage('nombre is required.'),
  body('certificados').isInt({ min: 1 }).withMessage('certificados must be a positive integer.'),
  positiveNumber('precio_compra'),
  positiveNumber('precio_actual'),
];

// ─── Retiro  { tipo, nombre, institucion, subcuenta, saldo,
//               aportacion_ytd, aportacion_patronal, rendimiento, proyeccion } ─
const retiroRules = [
  body('tipo').trim().notEmpty().withMessage('tipo is required.'),
  body('nombre').trim().notEmpty().withMessage('nombre is required.'),
  body('institucion').trim().notEmpty().withMessage('institucion is required.'),
  positiveNumber('saldo'),
];

// ─── Bienes  { nombre, tipo, ubicacion, precio_compra, gastos_notariales,
//               escrituracion, impuesto_adquisicion, otros_gastos,
//               valor_actual, saldo_hipoteca, renta_mensual } ─────────────────
const bienesRules = [
  body('nombre').trim().notEmpty().withMessage('nombre is required.'),
  body('tipo').trim().notEmpty().withMessage('tipo is required.'),
  positiveNumber('precio_compra'),
  positiveNumber('valor_actual'),
];

// ─── Crypto  { symbol, name, amount, avg_cost, current_price } ───────────────
const cryptoRules = [
  body('symbol').trim().notEmpty().withMessage('symbol is required.').toUpperCase(),
  body('name').trim().notEmpty().withMessage('name is required.'),
  positiveNumber('amount'),
  positiveNumber('avg_cost'),
  positiveNumber('current_price'),
];

module.exports = {
  stocksRouter:  buildRouter('stocks',  stocksRules),
  bonosRouter:   buildRouter('bonos',   bonosRules),
  fondosRouter:  buildRouter('fondos',  fondosRules),
  fibrasRouter:  buildRouter('fibras',  fibrasRules),
  retiroRouter:  buildRouter('retiro',  retiroRules),
  bienesRouter:  buildRouter('bienes',  bienesRules),
  cryptoRouter:  buildRouter('crypto',  cryptoRules),
};
