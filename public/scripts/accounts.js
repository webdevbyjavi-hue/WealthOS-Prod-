/* ══════════════════════════════════════════════════════════════
   WealthOS — Bank Accounts Page
══════════════════════════════════════════════════════════════ */

const STORAGE_KEY  = 'wealthos_accounts';
const CASHFLOW_KEY = 'wealthos_transactions';

/* ─── State ──────────────────────────────────────────────────── */
let accounts      = [];
let transactions  = [];
let editingId     = null;
let sortCol       = 'name';
let sortDir       = 1;
let filterText    = '';
let filterCurrency = '';
let filterCountry  = '';

/* ─── Chart instances ─────────────────────────────────────────── */
let chartCurrency = null;
let chartCashflow = null;

/* ─── Palette ────────────────────────────────────────────────── */
const PALETTE = [
  '#6366f1', // indigo   — app accent
  '#34d399', // emerald
  '#f87171', // coral
  '#fbbf24', // amber
  '#60a5fa', // sky blue
  '#f472b6', // pink
  '#fb923c', // orange
  '#2dd4bf', // teal
  '#a78bfa', // lavender
  '#facc15', // yellow
  '#4ade80', // lime
  '#38bdf8', // light blue
  '#e879f9', // magenta
  '#c084fc', // violet
  '#94a3b8', // slate
];

/* ─── Init ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('current-date').textContent =
    new Date().toLocaleDateString(window.WOS_LOCALE || 'en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

  // Set today as default date in modal
  document.getElementById('ai-updated').valueAsDate = new Date();

  load();
  loadTransactions();
  render();
});

/* ─── Persistence ─────────────────────────────────────────────── */
function load() {
  try { accounts = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { accounts = []; }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
}

function loadTransactions() {
  try { transactions = JSON.parse(localStorage.getItem(CASHFLOW_KEY)) || []; }
  catch { transactions = []; }
}

function saveTransactions() {
  localStorage.setItem(CASHFLOW_KEY, JSON.stringify(transactions));
}

/* ─── Modal ───────────────────────────────────────────────────── */
function openAddModal() {
  editingId = null;
  document.getElementById('modal-title').textContent    = typeof t === 'function' ? t('modal_add_account') : 'Add Account';
  document.getElementById('modal-save-btn').textContent = typeof t === 'function' ? t('btn_save_account') : 'Save Account';
  clearForm();
  document.getElementById('ai-updated').valueAsDate = new Date();
  document.getElementById('acct-modal-overlay').classList.add('modal-overlay--visible');
}

function openEditModal(id) {
  const acct = accounts.find(a => a.id === id);
  if (!acct) return;
  editingId = id;
  document.getElementById('modal-title').textContent    = typeof t === 'function' ? t('modal_edit_account') : 'Edit Account';
  document.getElementById('modal-save-btn').textContent = typeof t === 'function' ? t('btn_update_account') : 'Update Account';
  document.getElementById('ai-name').value     = acct.name;
  document.getElementById('ai-bank').value     = acct.bank;
  document.getElementById('ai-country').value  = acct.country;
  document.getElementById('ai-type').value     = acct.type;
  document.getElementById('ai-currency').value = acct.currency;
  document.getElementById('ai-balance').value  = acct.balance;
  document.getElementById('ai-fxrate').value   = acct.fxRate;
  document.getElementById('ai-updated').value  = acct.updatedAt;
  document.getElementById('ai-notes').value    = acct.notes || '';
  updateFXHint();
  document.getElementById('acct-modal-overlay').classList.add('modal-overlay--visible');
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('acct-modal-overlay')) return;
  document.getElementById('acct-modal-overlay').classList.remove('modal-overlay--visible');
}

function clearForm() {
  ['ai-name','ai-bank','ai-balance','ai-notes'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('ai-country').value  = 'Mexico 🇲🇽';
  document.getElementById('ai-type').value     = 'Checking';
  document.getElementById('ai-currency').value = 'MXN';
  document.getElementById('ai-fxrate').value   = '1';
  updateFXHint();
}

function updateFXHint() {
  const cur = document.getElementById('ai-currency').value;
  const lbl = document.getElementById('fx-label');
  if (cur === 'MXN') {
    lbl.textContent = typeof t === 'function' ? t('fx_rate_mxn') : 'FX Rate (MXN = 1.00)';
    document.getElementById('ai-fxrate').value = '1';
  } else {
    const isES = window.WOS_LANG === 'es';
    lbl.textContent = isES ? `Tipo de Cambio (1 ${cur} = ? MXN)` : `FX Rate (1 ${cur} = ? MXN)`;
  }
}

/* ─── Save / Delete ──────────────────────────────────────────── */
function saveAccount() {
  const name    = document.getElementById('ai-name').value.trim();
  const bank    = document.getElementById('ai-bank').value.trim();
  const country = document.getElementById('ai-country').value;
  const type    = document.getElementById('ai-type').value;
  const currency = document.getElementById('ai-currency').value;
  const balance = parseFloat(document.getElementById('ai-balance').value);
  const fxRate  = parseFloat(document.getElementById('ai-fxrate').value) || 1;
  const updatedAt = document.getElementById('ai-updated').value;
  const notes   = document.getElementById('ai-notes').value.trim();

  if (!name || !bank || isNaN(balance)) {
    toast(typeof t === 'function' ? t('err_fill_account') : 'Please fill in account name, bank, and balance.', 'error');
    return;
  }

  const record = { name, bank, country, type, currency, balance, fxRate,
                   balanceMXN: balance * fxRate, updatedAt, notes };

  if (editingId) {
    const idx = accounts.findIndex(a => a.id === editingId);
    accounts[idx] = { ...accounts[idx], ...record };
    toast(typeof t === 'function' ? t('toast_account_updated') : 'Account updated.', 'success');
    logEvent({ type: 'account_updated', category: 'Account', icon: '🏦', title: `Updated Account: ${name}`, detail: `${bank} · ${currency} · Balance ${currency} ${balance.toLocaleString()}`, amount: balance * (record.fxRate || 1) });
  } else {
    record.id = Date.now().toString();
    accounts.push(record);
    toast(typeof t === 'function' ? t('toast_account_added') : 'Account added.', 'success');
    logEvent({ type: 'account_added', category: 'Account', icon: '🏦', title: `Added Account: ${name}`, detail: `${bank} · ${type} · ${currency} · ${country}`, amount: balance * (record.fxRate || 1) });
  }

  save();
  render();
  document.getElementById('acct-modal-overlay').classList.remove('modal-overlay--visible');
}

function deleteAccount(id) {
  const acct = accounts.find(a => a.id === id);
  if (acct) logEvent({ type: 'account_removed', category: 'Account', icon: '🗑️', title: `Removed Account: ${acct.name}`, detail: `${acct.bank} · ${acct.currency} · Balance ${acct.currency} ${acct.balance.toLocaleString()}`, amount: acct.balanceMXN || 0 });
  accounts = accounts.filter(a => a.id !== id);
  save();
  render();
  toast(typeof t === 'function' ? t('toast_account_removed') : 'Account removed.', 'warning');
}

/* ─── Transaction Modal ──────────────────────────────────────── */
function openAddTransactionModal() {
  if (accounts.length === 0) { toast(typeof t === 'function' ? t('err_add_account_first') : 'Add at least one account first.', 'warning'); return; }
  const sel = document.getElementById('ti-account');
  sel.innerHTML = accounts.map(a =>
    `<option value="${escHtml(a.id)}">${escHtml(a.name)} (${escHtml(a.currency)})</option>`
  ).join('');
  document.getElementById('ti-type').value = 'in';
  document.getElementById('ti-amount').value = '';
  document.getElementById('ti-date').valueAsDate = new Date();
  document.getElementById('ti-description').value = '';
  document.getElementById('txn-modal-overlay').classList.add('modal-overlay--visible');
}

function closeTxnModal(e) {
  if (e && e.target !== document.getElementById('txn-modal-overlay')) return;
  document.getElementById('txn-modal-overlay').classList.remove('modal-overlay--visible');
}

function saveTransaction() {
  const accountId   = document.getElementById('ti-account').value;
  const type        = document.getElementById('ti-type').value;
  const amount      = parseFloat(document.getElementById('ti-amount').value);
  const date        = document.getElementById('ti-date').value;
  const description = document.getElementById('ti-description').value.trim();

  if (!accountId || isNaN(amount) || amount <= 0 || !date) {
    toast(typeof t === 'function' ? t('err_fill_transaction') : 'Please fill in account, amount, and date.', 'error');
    return;
  }

  const acct = accounts.find(a => a.id === accountId);
  const fxRate = acct ? (acct.fxRate || 1) : 1;

  transactions.push({
    id: Date.now().toString(),
    accountId, type, amount, fxRate,
    amountMXN: amount * fxRate,
    date, description
  });

  const acctName = acct ? acct.name : accountId;
  const currency = acct ? acct.currency : '';
  if (type === 'in') {
    logEvent({ type: 'transaction_in', category: 'Transaction', icon: '↓', title: `Cash In: ${acctName}`, detail: `${currency} ${amount.toLocaleString()}${description ? ' · ' + description : ''} · ${date}`, amount: amount * fxRate });
  } else {
    logEvent({ type: 'transaction_out', category: 'Transaction', icon: '↑', title: `Cash Out: ${acctName}`, detail: `${currency} ${amount.toLocaleString()}${description ? ' · ' + description : ''} · ${date}`, amount: -(amount * fxRate) });
  }
  saveTransactions();
  renderCashFlowChart();
  document.getElementById('txn-modal-overlay').classList.remove('modal-overlay--visible');
  toast(typeof t === 'function' ? t('toast_transaction_saved') : 'Transaction saved.', 'success');
}

/* ─── Filter / Sort ──────────────────────────────────────────── */
function filterTable(text) {
  filterText     = text.toLowerCase();
  filterCurrency = document.getElementById('filter-currency').value;
  filterCountry  = document.getElementById('filter-country').value;
  renderTable();
}

function sortBy(col) {
  if (sortCol === col) { sortDir *= -1; }
  else { sortCol = col; sortDir = 1; }
  document.querySelectorAll('.th-sort').forEach(th => th.classList.remove('th-sort--active'));
  const active = document.querySelector(`.th-sort[data-col="${col}"]`);
  if (active) active.classList.add('th-sort--active');
  renderTable();
}

function getFiltered() {
  return accounts.filter(a => {
    const matchText = !filterText ||
      a.name.toLowerCase().includes(filterText) ||
      a.bank.toLowerCase().includes(filterText) ||
      a.currency.toLowerCase().includes(filterText) ||
      a.country.toLowerCase().includes(filterText);
    const matchCur  = !filterCurrency || a.currency === filterCurrency;
    const matchCtr  = !filterCountry  || a.country  === filterCountry;
    return matchText && matchCur && matchCtr;
  });
}

function getSorted(list) {
  return [...list].sort((a, b) => {
    let av = a[sortCol] ?? '', bv = b[sortCol] ?? '';
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    return av < bv ? -sortDir : av > bv ? sortDir : 0;
  });
}

/* ─── Render ─────────────────────────────────────────────────── */
function render() {
  updateSummary();
  updateKPIs();
  updateFilterDropdowns();
  renderCharts();
  renderTable();
}

function updateSummary() {
  const total      = accounts.reduce((s, a) => s + (a.balanceMXN || 0), 0);
  const currencies = new Set(accounts.map(a => a.currency)).size;
  const countries  = new Set(accounts.map(a => a.country)).size;

  document.getElementById('sum-total').textContent      = fmtMXN(total);
  document.getElementById('sum-accounts').textContent   = accounts.length;
  document.getElementById('sum-currencies').textContent = currencies;
  document.getElementById('sum-countries').textContent  = countries;
}

function updateKPIs() {
  const total      = accounts.reduce((s, a) => s + (a.balanceMXN || 0), 0);
  const currencies = new Set(accounts.map(a => a.currency)).size;
  const countries  = new Set(accounts.map(a => a.country)).size;

  document.getElementById('k-total').textContent           = fmtMXN(total);
  const isES2 = window.WOS_LANG === 'es';
  document.getElementById('k-accounts-label').textContent = isES2
    ? `${accounts.length} ${accounts.length !== 1 ? 'cuentas' : 'cuenta'}`
    : `${accounts.length} account${accounts.length !== 1 ? 's' : ''}`;
  document.getElementById('k-currencies').textContent      = currencies;
  document.getElementById('k-countries').textContent       = countries;

  if (accounts.length > 0) {
    const largest = accounts.reduce((best, a) => (a.balanceMXN > best.balanceMXN ? a : best), accounts[0]);
    document.getElementById('k-largest').textContent      = fmtMXN(largest.balanceMXN);
    document.getElementById('k-largest-name').textContent = `${largest.name} · ${largest.bank}`;
  } else {
    document.getElementById('k-largest').textContent      = 'MX$0.00';
    document.getElementById('k-largest-name').textContent = '—';
  }
}

function updateFilterDropdowns() {
  const currencies = [...new Set(accounts.map(a => a.currency))].sort();
  const countries  = [...new Set(accounts.map(a => a.country))].sort();

  const curSel = document.getElementById('filter-currency');
  const ctrSel = document.getElementById('filter-country');
  const savedCur = curSel.value;
  const savedCtr = ctrSel.value;

  const allCurrLabel = typeof t === 'function' ? t('opt_all_currencies') : 'All currencies';
  const allCtrLabel  = typeof t === 'function' ? t('opt_all_countries') : 'All countries';
  curSel.innerHTML = `<option value="">${allCurrLabel}</option>` +
    currencies.map(c => `<option value="${c}">${c}</option>`).join('');
  ctrSel.innerHTML = `<option value="">${allCtrLabel}</option>` +
    countries.map(c => `<option value="${c}">${c}</option>`).join('');

  if (currencies.includes(savedCur)) curSel.value = savedCur;
  if (countries.includes(savedCtr))  ctrSel.value = savedCtr;
}

function renderTable() {
  const tbody   = document.getElementById('body-accounts');
  const counter = document.getElementById('table-count');
  const list    = getSorted(getFiltered());

  const isES = window.WOS_LANG === 'es';
  counter.textContent = isES
    ? `${list.length} ${list.length !== 1 ? 'cuentas' : 'cuenta'}`
    : `${list.length} account${list.length !== 1 ? 's' : ''}`;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" class="table__empty">${
      accounts.length === 0
        ? (typeof t === 'function' ? t('empty_no_accounts') : 'No accounts yet. Add your first bank account.')
        : (typeof t === 'function' ? t('empty_no_filter_accts') : 'No accounts match the current filter.')
    }</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map((a, i) => {
    const color     = PALETTE[i % PALETTE.length];
    const pct       = totalMXN() > 0 ? ((a.balanceMXN / totalMXN()) * 100).toFixed(1) : '0.0';
    const updLabel  = a.updatedAt ? new Date(a.updatedAt + 'T00:00:00').toLocaleDateString(window.WOS_LOCALE || 'en-US', { month:'short', day:'numeric', year:'numeric' }) : '—';
    return `
    <tr class="table-row">
      <td><span class="asset__dot" style="background:${color};box-shadow:0 0 6px ${color}55"></span></td>
      <td class="td--name s-td-company">${escHtml(a.name)}</td>
      <td class="td--ticker">${escHtml(a.bank)}</td>
      <td><span class="td-country">${escHtml(a.country)}</span></td>
      <td><span class="type-badge">${escHtml(a.type)}</span></td>
      <td><span class="currency-badge">${escHtml(a.currency)}</span></td>
      <td class="td--price">${fmtLocal(a.balance, a.currency)}</td>
      <td class="td--price">${fmtMXN(a.balanceMXN)} <span style="font-size:10px;color:var(--text-tertiary)">(${pct}%)</span></td>
      <td class="td--muted">${fmtRate(a.fxRate, a.currency)}</td>
      <td class="td--muted">${updLabel}</td>
      <td>
        <div class="acct-row-actions">
          <button class="acct-btn-edit s-btn-edit" onclick="openEditModal('${a.id}')" title="Edit">✎</button>
          <button class="btn-remove" onclick="deleteAccount('${a.id}')" title="Remove">✕</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function totalMXN() {
  return accounts.reduce((s, a) => s + (a.balanceMXN || 0), 0);
}

/* ─── Charts ─────────────────────────────────────────────────── */
function renderCharts() {
  renderCurrencyChart();
  renderCashFlowChart();
}

function buildDonut(canvasId, labels, data, instance) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  if (instance) instance.destroy();

  const colors = labels.map((_, i) => PALETTE[i % PALETTE.length]);
  const cfg = {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderColor: 'transparent',
                   hoverBorderColor: colors, borderWidth: 0,
                   hoverOffset: 6 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '66%',
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: '#8892a4',
            font: { family: "'DM Mono'", size: 11 },
            padding: 14,
            usePointStyle: true,
            pointStyle: 'circle',
            boxWidth: 8,
            boxHeight: 8,
          }
        },
        tooltip: {
          backgroundColor: '#111525',
          borderColor: '#1e2640',
          borderWidth: 1,
          titleColor: '#eef0ff',
          bodyColor: '#8892a4',
          titleFont: { family: "'DM Sans'", size: 13 },
          bodyFont:  { family: "'DM Mono'",  size: 11 },
          callbacks: {
            label: ctx => ` ${fmtMXN(ctx.parsed)} (${((ctx.parsed / data.reduce((a,b)=>a+b,0))*100).toFixed(1)}%)`
          }
        }
      }
    }
  };
  return new Chart(ctx, cfg);
}

function renderCurrencyChart() {
  const groups = {};
  accounts.forEach(a => {
    groups[a.currency] = (groups[a.currency] || 0) + (a.balanceMXN || 0);
  });
  const labels = Object.keys(groups);
  const data   = Object.values(groups);

  if (labels.length === 0) {
    const ctx = document.getElementById('chart-currency').getContext('2d');
    if (chartCurrency) chartCurrency.destroy();
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    chartCurrency = null;
    return;
  }
  chartCurrency = buildDonut('chart-currency', labels, data, chartCurrency);
}

function renderCashFlowChart() {
  // Build last 6 months
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      label: d.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' }),
      key:   `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    });
  }

  const inData  = months.map(m => transactions
    .filter(t => t.type === 'in'  && t.date.startsWith(m.key))
    .reduce((s, t) => s + (t.amountMXN || 0), 0));
  const outData = months.map(m => transactions
    .filter(t => t.type === 'out' && t.date.startsWith(m.key))
    .reduce((s, t) => s + (t.amountMXN || 0), 0));

  const ctx = document.getElementById('chart-cashflow').getContext('2d');
  if (chartCashflow) chartCashflow.destroy();

  chartCashflow = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: months.map(m => m.label),
      datasets: [
        {
          label: 'Cash In',
          data: inData,
          backgroundColor: 'rgba(52, 211, 153, 0.65)',
          borderColor: '#34d399',
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: 'Cash Out',
          data: outData,
          backgroundColor: 'rgba(248, 113, 113, 0.65)',
          borderColor: '#f87171',
          borderWidth: 1,
          borderRadius: 4,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: '#8892a4',
            font: { family: "'DM Mono'", size: 11 },
            usePointStyle: true,
            pointStyle: 'circle',
            boxWidth: 8,
            boxHeight: 8,
            padding: 16,
          }
        },
        tooltip: {
          backgroundColor: '#111525',
          borderColor: '#1e2640',
          borderWidth: 1,
          titleColor: '#eef0ff',
          bodyColor: '#8892a4',
          titleFont: { family: "'DM Sans'", size: 13 },
          bodyFont:  { family: "'DM Mono'",  size: 11 },
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${fmtMXN(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          grid:  { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#8892a4', font: { family: "'DM Mono'", size: 11 } }
        },
        y: {
          grid:  { color: 'rgba(255,255,255,0.04)' },
          border: { dash: [3, 3] },
          ticks: {
            color: '#8892a4',
            font:  { family: "'DM Mono'", size: 10 },
            callback: v => v === 0 ? '0' : fmtMXN(v)
          }
        }
      }
    }
  });
}

/* ─── Formatting helpers ─────────────────────────────────────── */
function fmtMXN(n) {
  return new Intl.NumberFormat('es-MX', { style:'currency', currency:'MXN', minimumFractionDigits:2 }).format(n || 0);
}

function fmtLocal(n, currency) {
  try {
    return new Intl.NumberFormat('es-MX', { style:'currency', currency, minimumFractionDigits:2, maximumFractionDigits:2 }).format(n || 0);
  } catch {
    return `${currency} ${(n || 0).toLocaleString('es-MX', { minimumFractionDigits:2, maximumFractionDigits:2 })}`;
  }
}

function fmtRate(rate, currency) {
  if (currency === 'MXN') return '1.00000';
  return Number(rate).toFixed(5);
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ─── Export ─────────────────────────────────────────────────── */
document.getElementById('export-btn').addEventListener('click', () => {
  if (accounts.length === 0) { toast('No accounts to export.', 'warning'); return; }
  const header = ['Name','Bank','Country','Type','Currency','Balance (local)','Balance (MXN)','FX Rate','Last Updated','Notes'];
  const rows   = accounts.map(a =>
    [a.name, a.bank, a.country, a.type, a.currency, a.balance, (a.balanceMXN || 0).toFixed(2), a.fxRate, a.updatedAt, a.notes || '']
    .map(v => `"${String(v).replace(/"/g,'""')}"`)
    .join(',')
  );
  const csv  = [header.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type:'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `wealthos-accounts-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Exported to CSV.', 'success');
});

/* ─── Toast ──────────────────────────────────────────────────── */
function toast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.textContent = msg;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('toast--visible'));
  setTimeout(() => {
    el.classList.remove('toast--visible');
    setTimeout(() => el.remove(), 350);
  }, 3000);
}
