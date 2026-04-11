'use strict';

/**
 * banxicoService.js
 * ─────────────────
 * Fetches the latest "Tasa de Interés" for Mexican government bond instruments
 * from the Banxico BMX (SIE) REST API.
 *
 * BMX API docs: https://www.banxico.org.mx/SieAPIRest/service/v1/doc/catalogoSeries
 * Endpoint: GET /SieAPIRest/service/v1/series/{idSerie}/datos/oportuno
 * Auth:     Bmx-Token header
 *
 * Series → Banxico SIE series ID mapping:
 *   CETES   → SF43936  CETES 28 días — tasa de rendimiento en subasta primaria
 *   BONDIA  → SF60653  Tasa de fondeo bancario (overnight) — benchmark for BONDÍA
 *   BONOS   → SF60648  Bonos de desarrollo del Gobierno Federal a tasa fija (M 10 años)
 *   UDIBONOS → SF44119 UDIBONOS — tasa de rendimiento en subasta primaria (3 años)
 *
 * These can be updated in SERIES_MAP if Banxico changes their catalogue.
 */

const BMX_BASE = 'https://www.banxico.org.mx/SieAPIRest/service/v1/series';

/** Maps the UI instrumento value to a Banxico SIE series ID. */
const SERIES_MAP = {
  CETES:    'SF43936',
  BONDIA:   'SF60653',
  BONOS:    'SF60648',
  UDIBONOS: 'SF44119',
};

/**
 * Returns the latest tasa de interés for a given instrument.
 *
 * @param {string} instrumento — one of CETES, BONDIA, BONOS, UDIBONOS
 * @returns {Promise<{ instrumento: string, tasa: number, fecha: string, serie: string }>}
 * @throws if the instrument is unknown, the API is unreachable, or the response is malformed
 */
async function getTasa(instrumento) {
  const key = instrumento.toUpperCase();
  const idSerie = SERIES_MAP[key];

  if (!idSerie) {
    const err = new Error(`Instrumento desconocido: ${instrumento}. Válidos: ${Object.keys(SERIES_MAP).join(', ')}`);
    err.status = 400;
    throw err;
  }

  const token = process.env.BANXICO_BMX_TOKEN;
  if (!token) {
    throw new Error('[banxicoService] BANXICO_BMX_TOKEN not set in environment.');
  }

  const url = `${BMX_BASE}/${idSerie}/datos/oportuno`;

  const res = await fetch(url, {
    headers: { 'Bmx-Token': token },
  });

  if (!res.ok) {
    throw new Error(`[banxicoService] Banxico API HTTP ${res.status} for serie ${idSerie}`);
  }

  const json = await res.json();

  // Response shape: { bmx: { series: [{ idSerie, titulo, datos: [{ fecha, dato }] }] } }
  const datos = json?.bmx?.series?.[0]?.datos;
  if (!Array.isArray(datos) || datos.length === 0) {
    throw new Error(`[banxicoService] No data returned for serie ${idSerie}`);
  }

  const latest = datos[datos.length - 1];
  const tasa   = parseFloat(latest.dato);

  if (isNaN(tasa)) {
    throw new Error(`[banxicoService] Non-numeric dato "${latest.dato}" for serie ${idSerie}`);
  }

  return {
    instrumento: key,
    tasa,
    fecha:  latest.fecha,
    serie:  idSerie,
  };
}

module.exports = { getTasa, SERIES_MAP };
