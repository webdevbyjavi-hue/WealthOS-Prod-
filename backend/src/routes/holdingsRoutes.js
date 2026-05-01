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
const stocksController   = require('../controllers/stocksController');
const banxicoService     = require('../services/banxicoService');
const { BONOS_CATALOG, TIPOS, getPlazosByTipo } = require('../config/bonosCatalog');
const { linkHoldingToAsset } = require('../services/assetLinker');

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

// ─── Stocks  { ticker, name, shares, avg_cost, current_price, purchase_date? } ─
const stocksRules = [
  body('ticker').trim().notEmpty().withMessage('ticker is required.').toUpperCase(),
  body('name').trim().notEmpty().withMessage('name is required.'),
  positiveNumber('shares'),
  positiveNumber('avg_cost'),
  positiveNumber('current_price'),
  body('purchase_date').optional().isISO8601().withMessage('purchase_date must be YYYY-MM-DD.'),
];

// ─── Bonos  { tipo, plazo, serie_banxico, purchase_date, tasa_compra, monto } ─
const bonosRules = [
  body('tipo').trim().notEmpty().withMessage('tipo is required.'),
  body('plazo').trim().notEmpty().withMessage('plazo is required.'),
  body('serie_banxico').trim().notEmpty().withMessage('serie_banxico is required.'),
  body('purchase_date').isISO8601().withMessage('purchase_date must be a valid date (YYYY-MM-DD).'),
  positiveNumber('tasa_compra'),
  positiveNumber('monto'),
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
//               precio_actual, distribucion, rendimiento, purchase_date? } ────
const fibrasRules = [
  body('ticker').trim().notEmpty().withMessage('ticker is required.').toUpperCase(),
  body('nombre').trim().notEmpty().withMessage('nombre is required.'),
  body('certificados').isInt({ min: 1 }).withMessage('certificados must be a positive integer.'),
  positiveNumber('precio_compra'),
  positiveNumber('precio_actual'),
  body('purchase_date').optional().isISO8601().withMessage('purchase_date must be YYYY-MM-DD.'),
];

// ─── Retiro  { tipo, nombre, institucion, subcuenta, saldo,
//               aportacion_ytd, aportacion_patronal, rendimiento, proyeccion } ─
const retiroRules = [
  body('tipo').trim().notEmpty().withMessage('tipo is required.'),
  body('nombre').trim().notEmpty().withMessage('nombre is required.'),
  body('institucion').trim().notEmpty().withMessage('institucion is required.'),
  positiveNumber('saldo'),
  body('fecha_compra').optional({ nullable: true }).isISO8601().withMessage('fecha_compra must be YYYY-MM-DD.'),
  body('fecha_retiro').optional({ nullable: true }).isISO8601().withMessage('fecha_retiro must be YYYY-MM-DD.'),
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

// ─── Crypto  { symbol, name, amount, avg_cost, current_price, purchase_date?, purchase_fx_rate? } ─
const cryptoRules = [
  body('symbol').trim().notEmpty().withMessage('symbol is required.').toUpperCase(),
  body('name').trim().notEmpty().withMessage('name is required.'),
  positiveNumber('amount'),
  positiveNumber('avg_cost'),
  positiveNumber('current_price'),
  body('purchase_date').optional().isISO8601().withMessage('purchase_date must be YYYY-MM-DD.'),
  body('purchase_fx_rate').optional().isFloat({ min: 0.0001 }).toFloat().withMessage('purchase_fx_rate must be a positive number.'),
];

// ─── withAssetLink — wrap a holdings `create` handler to auto-link to assets ──
//
// Intercepts res.json after a successful POST, extracts the saved holding row,
// and fires linkHoldingToAsset in the background. Never blocks the response.
//
// linkConfig: { assetType, tickerField, nameField, quantityField, priceField, currency }

function withAssetLink(originalCreate, linkConfig) {
  return function (req, res, next) {
    const originalJson = res.json.bind(res);

    res.json = function (body) {
      if (body?.success && body?.data) {
        const holding = body.data;
        setImmediate(() => {
          linkHoldingToAsset({
            userId:       req.user.id,
            ticker:       holding[linkConfig.tickerField],
            name:         holding[linkConfig.nameField],
            assetType:    linkConfig.assetType,
            currency:     linkConfig.currency || 'USD',
            purchaseDate: holding.purchase_date ?? req.body.purchase_date ?? null,
            quantity:     parseFloat(holding[linkConfig.quantityField]) || null,
            avgBuyPrice:  parseFloat(holding[linkConfig.priceField])    || null,
          });
        });
      }
      return originalJson(body);
    };

    return originalCreate(req, res, next);
  };
}

// ─── Stocks router — uses custom controller for MXN field computation ─────────
function buildStocksRouter() {
  const router = Router();
  router.get('/',    stocksController.list);
  router.post('/',   [...stocksRules, validate], stocksController.create);
  router.put('/:id', [uuidParam, validate],      stocksController.update);
  router.delete('/:id', [uuidParam, validate],   stocksController.remove);
  return router;
}

// ─── Bonos router — CRUD + catalog + live Banxico rate lookup ────────────────
function buildBonosRouter() {
  const router = buildRouter('bonos', bonosRules);

  // GET /api/bonos/catalog
  // Returns the full static catalog so the frontend can build cascading dropdowns
  // without an extra roundtrip when the modal opens.
  router.get('/catalog', (_req, res) => {
    res.json({
      success: true,
      data: { catalog: BONOS_CATALOG, tipos: TIPOS },
    });
  });

  // GET /api/bonos/tasa/:serie
  // Fetches the latest Tasa de Interés from Banxico BMX for a series ID.
  // serie must be a known ID from the catalog (e.g. "SF43936").
  router.get('/tasa/:serie', async (req, res, next) => {
    try {
      const data = await banxicoService.getTasaBySerie(req.params.serie);
      res.json({ success: true, data });
    } catch (err) {
      if (err.status === 400) {
        return res.status(400).json({ success: false, message: err.message });
      }
      next(err);
    }
  });

  return router;
}

// ─── Crypto router — uses holdingsController + auto-link to assets table ──────
function buildCryptoRouter() {
  const { list, create, update, remove } = holdingsController('crypto');
  const router = Router();
  router.get('/', list);
  router.post(
    '/',
    [...cryptoRules, validate],
    withAssetLink(create, {
      assetType:     'crypto',
      tickerField:   'symbol',
      nameField:     'name',
      quantityField: 'amount',
      priceField:    'avg_cost',
      currency:      'USD',
    })
  );
  router.put('/:id',    [uuidParam, validate], update);
  router.delete('/:id', [uuidParam, validate], remove);
  return router;
}

// ─── Fibras router — uses holdingsController + auto-link to assets table ──────
function buildFibrasRouter() {
  const { list, create, update, remove } = holdingsController('fibras');
  const router = Router();
  router.get('/', list);
  router.post(
    '/',
    [...fibrasRules, validate],
    withAssetLink(create, {
      assetType:     'reit',
      tickerField:   'ticker',
      nameField:     'nombre',
      quantityField: 'certificados',
      priceField:    'precio_compra',
      currency:      'MXN',
    })
  );
  router.put('/:id',    [uuidParam, validate], update);
  router.delete('/:id', [uuidParam, validate], remove);
  return router;
}

module.exports = {
  stocksRouter:  buildStocksRouter(),
  bonosRouter:   buildBonosRouter(),
  fondosRouter:  buildRouter('fondos',  fondosRules),
  fibrasRouter:  buildFibrasRouter(),
  retiroRouter:  buildRouter('retiro',  retiroRules),
  bienesRouter:  buildRouter('bienes',  bienesRules),
  cryptoRouter:  buildCryptoRouter(),
};
