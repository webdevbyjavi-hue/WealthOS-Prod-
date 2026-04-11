-- ─────────────────────────────────────────────────────────────────────────────
-- WealthOS — Supabase PostgreSQL Schema
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run
--
-- All tables use:
--   • UUID primary keys (gen_random_uuid)
--   • user_id linked to auth.users (Supabase managed)
--   • Row Level Security (RLS) so each user can only see their own rows
-- ─────────────────────────────────────────────────────────────────────────────


-- ══════════════════════════════════════════════════════════════════════════════
-- ACCOUNTS
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS accounts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  bank        TEXT NOT NULL,
  country     TEXT,
  type        TEXT,                   -- e.g. 'Cheques', 'Ahorro', 'Inversión'
  currency    TEXT NOT NULL DEFAULT 'MXN',
  balance     NUMERIC(18,4) NOT NULL DEFAULT 0,
  fx_rate     NUMERIC(12,6) NOT NULL DEFAULT 1,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "accounts: own rows only" ON accounts
  USING (user_id = auth.uid());


-- ══════════════════════════════════════════════════════════════════════════════
-- TRANSACTIONS (cash in / out tied to an account)
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('in', 'out')),
  amount      NUMERIC(18,4) NOT NULL CHECK (amount > 0),
  currency    TEXT NOT NULL DEFAULT 'MXN',
  fx_rate     NUMERIC(12,6) NOT NULL DEFAULT 1,
  description TEXT,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transactions: own rows only" ON transactions
  USING (user_id = auth.uid());


-- ══════════════════════════════════════════════════════════════════════════════
-- HISTORY EVENTS
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS history_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  category    TEXT NOT NULL CHECK (category IN ('Investment', 'Account', 'Transaction')),
  icon        TEXT NOT NULL DEFAULT '•',
  title       TEXT NOT NULL,
  detail      TEXT,
  amount      NUMERIC(18,4),
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE history_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "history_events: own rows only" ON history_events
  USING (user_id = auth.uid());

-- Keep a max of 500 rows per user (mirrors the original localStorage cap)
CREATE OR REPLACE FUNCTION trim_history_events()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM history_events
  WHERE user_id = NEW.user_id
    AND id NOT IN (
      SELECT id FROM history_events
      WHERE user_id = NEW.user_id
      ORDER BY timestamp DESC
      LIMIT 500
    );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_trim_history
  AFTER INSERT ON history_events
  FOR EACH ROW EXECUTE FUNCTION trim_history_events();


-- ══════════════════════════════════════════════════════════════════════════════
-- STOCKS
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS stocks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker            TEXT NOT NULL,
  name              TEXT NOT NULL,
  shares            NUMERIC(18,6) NOT NULL CHECK (shares >= 0),
  avg_cost          NUMERIC(18,4) NOT NULL CHECK (avg_cost >= 0),        -- in USD
  current_price     NUMERIC(18,4) NOT NULL CHECK (current_price >= 0),   -- in USD
  tipo_de_cambio    NUMERIC(12,6),            -- USD/MXN rate used for conversion (set by backend)
  precio_compra_mxn NUMERIC(18,4),            -- avg_cost × tipo_de_cambio  (set by backend)
  precio_actual_mxn NUMERIC(18,4),            -- current_price × tipo_de_cambio (set by backend)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, ticker)
);

ALTER TABLE stocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stocks: own rows only" ON stocks
  USING (user_id = auth.uid());


-- ══════════════════════════════════════════════════════════════════════════════
-- BONOS (Mexican government bonds: CETES, BONOS, UDIBONOS, BONDIA)
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bonos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instrumento     TEXT NOT NULL,      -- CETES | BONOS | UDIBONOS | BONDIA
  serie           TEXT NOT NULL,
  titulos         INTEGER NOT NULL CHECK (titulos > 0),
  valor_nominal   NUMERIC(18,4) NOT NULL CHECK (valor_nominal > 0),
  precio_compra   NUMERIC(18,4) NOT NULL CHECK (precio_compra > 0),
  precio_actual   NUMERIC(18,4) NOT NULL CHECK (precio_actual > 0),
  tasa_cupon      NUMERIC(8,4) NOT NULL DEFAULT 0,
  rendimiento     NUMERIC(8,4) NOT NULL,
  vencimiento     DATE NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE bonos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bonos: own rows only" ON bonos
  USING (user_id = auth.uid());


-- ══════════════════════════════════════════════════════════════════════════════
-- FONDOS (Mexican mutual funds)
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS fondos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clave           TEXT NOT NULL,
  nombre          TEXT NOT NULL,
  operadora       TEXT NOT NULL,
  unidades        NUMERIC(18,6) NOT NULL CHECK (unidades >= 0),
  precio_compra   NUMERIC(18,4) NOT NULL CHECK (precio_compra >= 0),
  nav_actual      NUMERIC(18,4) NOT NULL CHECK (nav_actual >= 0),
  rendimiento     NUMERIC(8,4),
  tipo            TEXT,               -- Renta Variable | Renta Fija | Patrimonial
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, clave)
);

ALTER TABLE fondos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fondos: own rows only" ON fondos
  USING (user_id = auth.uid());


-- ══════════════════════════════════════════════════════════════════════════════
-- FIBRAS (Mexican REITs)
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS fibras (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker          TEXT NOT NULL,
  nombre          TEXT NOT NULL,
  sector          TEXT,
  certificados    INTEGER NOT NULL CHECK (certificados > 0),
  precio_compra   NUMERIC(18,4) NOT NULL CHECK (precio_compra >= 0),
  precio_actual   NUMERIC(18,4) NOT NULL CHECK (precio_actual >= 0),
  distribucion    NUMERIC(18,4),
  rendimiento     NUMERIC(8,4),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, ticker)
);

ALTER TABLE fibras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fibras: own rows only" ON fibras
  USING (user_id = auth.uid());


-- ══════════════════════════════════════════════════════════════════════════════
-- RETIRO (retirement accounts: Afore, PPR, Plan Empresarial)
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS retiro (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo                  TEXT NOT NULL,   -- Afore | PPR | Plan Empresarial
  nombre                TEXT NOT NULL,
  institucion           TEXT NOT NULL,
  subcuenta             TEXT,
  saldo                 NUMERIC(18,2) NOT NULL CHECK (saldo >= 0),
  aportacion_ytd        NUMERIC(18,2) DEFAULT 0,
  aportacion_patronal   NUMERIC(18,2) DEFAULT 0,
  rendimiento           NUMERIC(8,4),
  proyeccion            NUMERIC(18,2),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE retiro ENABLE ROW LEVEL SECURITY;
CREATE POLICY "retiro: own rows only" ON retiro
  USING (user_id = auth.uid());


-- ══════════════════════════════════════════════════════════════════════════════
-- BIENES RAÍCES (real estate)
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bienes (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre                  TEXT NOT NULL,
  tipo                    TEXT NOT NULL,  -- Casa | Departamento | Local Comercial | Terreno
  ubicacion               TEXT,
  precio_compra           NUMERIC(18,2) NOT NULL CHECK (precio_compra >= 0),
  gastos_notariales       NUMERIC(18,2) DEFAULT 0,
  escrituracion           NUMERIC(18,2) DEFAULT 0,
  impuesto_adquisicion    NUMERIC(18,2) DEFAULT 0,
  otros_gastos            NUMERIC(18,2) DEFAULT 0,
  valor_actual            NUMERIC(18,2) NOT NULL CHECK (valor_actual >= 0),
  saldo_hipoteca          NUMERIC(18,2) DEFAULT 0,
  renta_mensual           NUMERIC(18,2) DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE bienes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bienes: own rows only" ON bienes
  USING (user_id = auth.uid());


-- ══════════════════════════════════════════════════════════════════════════════
-- CRYPTO
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS crypto (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol          TEXT NOT NULL,
  name            TEXT NOT NULL,
  amount          NUMERIC(24,8) NOT NULL CHECK (amount >= 0),
  avg_cost        NUMERIC(18,4) NOT NULL CHECK (avg_cost >= 0),
  current_price   NUMERIC(18,4) NOT NULL CHECK (current_price >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, symbol)
);

ALTER TABLE crypto ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crypto: own rows only" ON crypto
  USING (user_id = auth.uid());
