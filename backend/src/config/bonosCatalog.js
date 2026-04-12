'use strict';

/**
 * bonosCatalog.js
 * ───────────────
 * Static catalog of Mexican government bond series.
 *
 * Each entry maps a (tipo, plazo) pair to a Banxico BMX SIE series ID so we
 * can look up the current primary-market yield via the Banxico REST API.
 *
 * Series IDs come from the Banxico SIE catalogue:
 *   https://www.banxico.org.mx/SieAPIRest/service/v1/doc/catalogoSeries
 *
 * CETES primary-market rates (auction yield):
 *   SF43936  28 días   SF43939  91 días   SF43942  182 días   SF43945  364 días
 *
 * BONDES D (variable-rate development bonds):
 *   SF60632  1 año     SF60633  3 años    SF60634  5 años
 *
 * M-Bonos (fixed-rate, "Bonos M"):
 *   SF60648  3 años    SF60649  5 años    SF60650  10 años
 *   SF60651  20 años   SF60652  30 años
 *
 * UDIBONOS (inflation-linked):
 *   SF44119  3 años    SF44121  10 años   SF46410  30 años
 *
 * BONDDIA (overnight money-market fund — tasa fondeo bancario as reference):
 *   SF60653  diario
 */

const BONOS_CATALOG = [
  // ─── CETES ──────────────────────────────────────────────────────────────────
  { tipo: 'CETES',    plazo: '28 días',  serie_banxico: 'SF43936', descripcion: 'Certificados de la Tesorería de la Federación — 28 días' },
  { tipo: 'CETES',    plazo: '91 días',  serie_banxico: 'SF43939', descripcion: 'Certificados de la Tesorería de la Federación — 91 días' },
  { tipo: 'CETES',    plazo: '182 días', serie_banxico: 'SF43942', descripcion: 'Certificados de la Tesorería de la Federación — 182 días' },
  { tipo: 'CETES',    plazo: '364 días', serie_banxico: 'SF43945', descripcion: 'Certificados de la Tesorería de la Federación — 364 días (1 año)' },

  // ─── BONDES D ───────────────────────────────────────────────────────────────
  { tipo: 'BONDES D', plazo: '1 año',    serie_banxico: 'SF60632', descripcion: 'Bonos de Desarrollo del Gobierno Federal — tasa variable — 1 año' },
  { tipo: 'BONDES D', plazo: '3 años',   serie_banxico: 'SF60633', descripcion: 'Bonos de Desarrollo del Gobierno Federal — tasa variable — 3 años' },
  { tipo: 'BONDES D', plazo: '5 años',   serie_banxico: 'SF60634', descripcion: 'Bonos de Desarrollo del Gobierno Federal — tasa variable — 5 años' },

  // ─── M-Bonos ────────────────────────────────────────────────────────────────
  { tipo: 'M-Bonos',  plazo: '3 años',   serie_banxico: 'SF60648', descripcion: 'Bonos del Gobierno Federal a tasa fija — 3 años' },
  { tipo: 'M-Bonos',  plazo: '5 años',   serie_banxico: 'SF60649', descripcion: 'Bonos del Gobierno Federal a tasa fija — 5 años' },
  { tipo: 'M-Bonos',  plazo: '10 años',  serie_banxico: 'SF60650', descripcion: 'Bonos del Gobierno Federal a tasa fija — 10 años' },
  { tipo: 'M-Bonos',  plazo: '20 años',  serie_banxico: 'SF60651', descripcion: 'Bonos del Gobierno Federal a tasa fija — 20 años' },
  { tipo: 'M-Bonos',  plazo: '30 años',  serie_banxico: 'SF60652', descripcion: 'Bonos del Gobierno Federal a tasa fija — 30 años' },

  // ─── UDIBONOS ───────────────────────────────────────────────────────────────
  { tipo: 'UDIBONOS', plazo: '3 años',   serie_banxico: 'SF44119', descripcion: 'UDIBONOS — protección contra inflación — 3 años' },
  { tipo: 'UDIBONOS', plazo: '10 años',  serie_banxico: 'SF44121', descripcion: 'UDIBONOS — protección contra inflación — 10 años' },
  { tipo: 'UDIBONOS', plazo: '30 años',  serie_banxico: 'SF46410', descripcion: 'UDIBONOS — protección contra inflación — 30 años' },

  // ─── BONDDIA ────────────────────────────────────────────────────────────────
  // BONDDIA es un fondo de mercado de dinero (GBM/Cetesdirecto) que invierte en
  // reportos a 1 día. No tiene serie SIE propia; SF60653 es la tasa fondeo
  // bancario overnight de Banxico, usada como referencia de rendimiento.
  { tipo: 'BONDDIA', plazo: 'diario',    serie_banxico: 'SF60653', descripcion: 'BONDDIA — fondo mercado de dinero overnight (referencia: tasa fondeo bancario)' },
];

/** Unique instrument types, in display order. */
const TIPOS = [...new Set(BONOS_CATALOG.map(e => e.tipo))];

/**
 * Returns all catalog entries for a given tipo.
 * @param {string} tipo
 * @returns {Array<{tipo,plazo,serie_banxico,descripcion}>}
 */
function getPlazosByTipo(tipo) {
  return BONOS_CATALOG.filter(e => e.tipo === tipo);
}

/**
 * Resolves the catalog entry for a (tipo, plazo) pair.
 * @param {string} tipo
 * @param {string} plazo
 * @returns {{tipo,plazo,serie_banxico,descripcion}|undefined}
 */
function resolve(tipo, plazo) {
  return BONOS_CATALOG.find(e => e.tipo === tipo && e.plazo === plazo);
}

module.exports = { BONOS_CATALOG, TIPOS, getPlazosByTipo, resolve };
