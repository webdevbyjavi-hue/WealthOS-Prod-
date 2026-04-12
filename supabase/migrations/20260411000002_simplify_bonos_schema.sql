-- ──────────────────────────────────────────────────────────────────────────────
-- Migration 20260411000002 — Simplify bonos table schema
-- ──────────────────────────────────────────────────────────────────────────────
-- Old schema captured too many price/position fields that belong to broker
-- statements, not a portable wealth-tracking record.
-- New schema stores only the immutable purchase snapshot:
--   tipo          — instrument class (CETES, BONDES D, M-Bonos, UDIBONOS)
--   plazo         — maturity term (28 días, 10 años, …)
--   serie_banxico — Banxico BMX series ID for live rate lookups
--   purchase_date — date the position was opened
--   tasa_compra   — yield snapshot at purchase (never recalculated after save)
--   monto         — invested amount in MXN
--   descripcion   — human-readable description from the catalog (optional)
-- ──────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. Remove old columns ---------------------------------------------------------
ALTER TABLE bonos
  DROP COLUMN IF EXISTS instrumento,
  DROP COLUMN IF EXISTS serie,
  DROP COLUMN IF EXISTS titulos,
  DROP COLUMN IF EXISTS valor_nominal,
  DROP COLUMN IF EXISTS precio_compra,
  DROP COLUMN IF EXISTS precio_actual,
  DROP COLUMN IF EXISTS tasa_cupon,
  DROP COLUMN IF EXISTS rendimiento,
  DROP COLUMN IF EXISTS vencimiento;

-- 2. Add new columns as nullable so existing rows don't break ------------------
ALTER TABLE bonos
  ADD COLUMN IF NOT EXISTS tipo          TEXT,
  ADD COLUMN IF NOT EXISTS plazo         TEXT,
  ADD COLUMN IF NOT EXISTS serie_banxico TEXT,
  ADD COLUMN IF NOT EXISTS purchase_date DATE,
  ADD COLUMN IF NOT EXISTS tasa_compra   NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS monto         NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS descripcion   TEXT;

-- 3. Backfill any rows that pre-date this migration ----------------------------
UPDATE bonos
SET
  tipo          = COALESCE(tipo,          'CETES'),
  plazo         = COALESCE(plazo,         '28 días'),
  serie_banxico = COALESCE(serie_banxico, 'SF43936'),
  purchase_date = COALESCE(purchase_date, CURRENT_DATE),
  tasa_compra   = COALESCE(tasa_compra,   0),
  monto         = COALESCE(monto,         0)
WHERE tipo IS NULL
   OR plazo IS NULL
   OR serie_banxico IS NULL
   OR purchase_date IS NULL
   OR tasa_compra IS NULL
   OR monto IS NULL;

-- 4. Enforce NOT NULL now that every row has values ---------------------------
ALTER TABLE bonos
  ALTER COLUMN tipo          SET NOT NULL,
  ALTER COLUMN plazo         SET NOT NULL,
  ALTER COLUMN serie_banxico SET NOT NULL,
  ALTER COLUMN purchase_date SET NOT NULL,
  ALTER COLUMN tasa_compra   SET NOT NULL,
  ALTER COLUMN monto         SET NOT NULL;

COMMIT;
