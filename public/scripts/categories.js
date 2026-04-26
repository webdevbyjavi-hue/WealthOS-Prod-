/* ══════════════════════════════════════════════════════════════
   WealthOS — Shared transaction category definitions
   Loaded before accounts.js and transactions.js
══════════════════════════════════════════════════════════════ */

window.WOS_CATEGORIES = {
  /* ─── Cash In ─────────────────────────────────────────────── */
  salary:        { label: 'Nómina',              color: '#34d399' },
  freelance:     { label: 'Freelance',            color: '#2dd4bf' },
  reimbursement: { label: 'Reembolso',            color: '#60a5fa' },
  transfer_in:   { label: 'Transferencia',        color: '#94a3b8' },
  dividend:      { label: 'Dividendo',            color: '#a78bfa' },
  other_income:  { label: 'Otros Ingresos',       color: '#fbbf24' },

  /* ─── Cash Out ─────────────────────────────────────────────── */
  fixed:         { label: 'Gastos Fijos',         color: '#fbbf24' },
  variable:      { label: 'Gastos Variables',     color: '#60a5fa' },
  credit_card:   { label: 'Tarjetas de Crédito',  color: '#f87171' },
  company:       { label: 'Gasto Empresarial',    color: '#fb923c' },
  transfer_out:  { label: 'Transferencia',        color: '#94a3b8' },
  transfers:     { label: 'Transferencia',        color: '#94a3b8' }, // legacy

  /* ─── Invested ─────────────────────────────────────────────── */
  stocks:        { label: 'Acciones',             color: '#6366f1' },
  bonds:         { label: 'CETES / Bonos',        color: '#34d399' },
  funds:         { label: 'Fondos de Inversión',  color: '#60a5fa' },
  fibras:        { label: 'FIBRAs',               color: '#fbbf24' },
  retirement:    { label: 'Retiro / Afore',       color: '#a78bfa' },
  real_estate:   { label: 'Bienes Raíces',        color: '#2dd4bf' },
  crypto:        { label: 'Crypto',               color: '#f87171' },
  other_inv:     { label: 'Otra Inversión',       color: '#94a3b8' },
};

window.WOS_CATS_BY_TYPE = {
  in:       ['salary', 'freelance', 'reimbursement', 'transfer_in', 'dividend', 'other_income'],
  out:      ['fixed', 'variable', 'credit_card', 'company', 'transfer_out'],
  invested: ['stocks', 'bonds', 'funds', 'fibras', 'retirement', 'real_estate', 'crypto', 'other_inv'],
};

window.WOS_CAT_LABELS = {
  in:       'Income Category',
  out:      'Expense Category',
  invested: 'Instrument Type',
};
