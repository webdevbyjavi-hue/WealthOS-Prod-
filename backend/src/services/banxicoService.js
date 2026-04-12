'use strict';

/**
 * banxicoService.js
 * ─────────────────
 * Fetches the latest "Tasa de Interés" from the Banxico BMX (SIE) REST API.
 *
 * Endpoint: GET /SieAPIRest/service/v1/series/{idSerie}/datos/oportuno
 * Auth:     Bmx-Token request header
 * Docs:     https://www.banxico.org.mx/SieAPIRest/service/v1/doc/catalogoSeries
 *
 * The catalog that maps (tipo, plazo) → serie_banxico lives in
 * src/config/bonosCatalog.js and is served via GET /api/bonos/catalog.
 * This service only cares about the raw series ID — it's agnostic to catalog.
 */

const { BONOS_CATALOG } = require('../config/bonosCatalog');

const BMX_BASE = 'https://www.banxico.org.mx/SieAPIRest/service/v1/series';

/** Set of valid Banxico series IDs from our catalog, for fast validation. */
const VALID_SERIES = new Set(BONOS_CATALOG.map(e => e.serie_banxico));

/**
 * Fetches the latest published rate for a given Banxico SIE series ID.
 *
 * @param {string} serieBanxico — e.g. "SF43936"
 * @returns {Promise<{ serie_banxico: string, tasa: number, fecha: string }>}
 * @throws {Error} with .status = 400 for unknown series IDs
 */
async function getTasaBySerie(serieBanxico) {
  const serie = serieBanxico.trim().toUpperCase();

  if (!VALID_SERIES.has(serie)) {
    const err = new Error(`Serie desconocida: ${serie}. Válidas: ${[...VALID_SERIES].join(', ')}`);
    err.status = 400;
    throw err;
  }

  const token = process.env.BANXICO_BMX_TOKEN;
  if (!token) {
    throw new Error('[banxicoService] BANXICO_BMX_TOKEN not set in environment.');
  }

  const url = `${BMX_BASE}/${serie}/datos/oportuno`;
  const res = await fetch(url, { headers: { 'Bmx-Token': token } });

  if (!res.ok) {
    throw new Error(`[banxicoService] Banxico API HTTP ${res.status} for serie ${serie}`);
  }

  const json = await res.json();
  // Response: { bmx: { series: [{ idSerie, titulo, datos: [{ fecha, dato }] }] } }
  const datos = json?.bmx?.series?.[0]?.datos;
  if (!Array.isArray(datos) || datos.length === 0) {
    throw new Error(`[banxicoService] No data returned for serie ${serie}`);
  }

  const latest = datos[datos.length - 1];
  const tasa   = parseFloat(latest.dato);

  if (isNaN(tasa)) {
    throw new Error(`[banxicoService] Non-numeric dato "${latest.dato}" for serie ${serie}`);
  }

  return { serie_banxico: serie, tasa, fecha: latest.fecha };
}

module.exports = { getTasaBySerie };
