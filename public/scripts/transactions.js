/* ══════════════════════════════════════════════════════════════
   WealthOS — Transactions Page
══════════════════════════════════════════════════════════════ */

/* ─── Categories (loaded from categories.js) ─────────────────── */
const CATEGORIES   = window.WOS_CATEGORIES;
const CATS_BY_TYPE = window.WOS_CATS_BY_TYPE;
const CAT_LABELS   = window.WOS_CAT_LABELS;

/* ─── State ──────────────────────────────────────────────────── */
let accounts     = [];
let transactions = [];
let editingTxnId = null;
let flowView        = null; // null = all, 'in', 'out', 'invested'
let timeframeFilter = 'ytd'; // 'all' | '1w' | '1m' | '3m' | 'ytd' | 'custom'
let sortCol      = 'date';
let sortDir      = -1;
let filterText     = '';
let filterType     = '';
let filterDateFrom = '';
let filterDateTo   = '';
let catFilterType  = 'out';
let catFilterYear  = '';
let catFilterMonth = '';
let currentPage    = 1;
const PAGE_SIZE    = 10;
let chartBarFilter = null; // { key: string, type: string } | null
let flowMonths     = [];

/* ─── Chart instances ─────────────────────────────────────────── */
let chartFlow     = null;
let chartCategory = null;

/* ─── Init ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('current-date').textContent =
    new Date().toLocaleDateString(window.WOS_LOCALE || 'en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

  try {
    accounts = await WOS_API.accounts.list();
    if (accounts.length > 0) {
      const txArrays = await Promise.all(
        accounts.map(a => WOS_API.accounts.listTransactions(a.id).catch(() => []))
      );
      transactions = txArrays.flatMap((txns, i) =>
        txns.map(t => ({
          ...t,
          accountName: accounts[i].name,
          currency:    t.currency || accounts[i].currency,
        }))
      );
    }
  } catch (_) {
    accounts     = [];
    transactions = [];
  }

  render();
});

/* ─── Category options helper ────────────────────────────────── */
function updateCategoryVisibility() {
  const type    = document.getElementById('ti-type').value;
  const labelEl = document.getElementById('ti-category-label');
  const sel     = document.getElementById('ti-category');
  if (!sel) return;

  if (labelEl) labelEl.textContent = CAT_LABELS[type] || 'Category';

  const keys = CATS_BY_TYPE[type] || [];
  sel.innerHTML = '<option value="">— Select category —</option>' +
    keys.map(k => `<option value="${k}">${CATEGORIES[k].label}</option>`).join('');
}

/* ─── Modal helpers ──────────────────────────────────────────── */
function _setModalMode(mode) {
  const isEdit = mode === 'edit';
  document.getElementById('txn-modal-title').textContent    = isEdit ? 'Edit Transaction'   : 'Add Transaction';
  document.getElementById('txn-modal-save-btn').textContent = isEdit ? 'Update Transaction' : 'Save Transaction';
  document.getElementById('ti-account').disabled            = isEdit;
}

function _fillModalFromTxn(txn) {
  const sel = document.getElementById('ti-account');
  sel.innerHTML = '<option value="">— Select account —</option>' + accounts.map(a =>
    `<option value="${escHtml(a.id)}">${escHtml(a.name)} (${escHtml(a.currency)})</option>`
  ).join('');
  sel.value = txn.accountId;

  document.getElementById('ti-type').value        = txn.type;
  document.getElementById('ti-amount').value      = txn.amount;
  document.getElementById('ti-date').value        = txn.date || '';
  document.getElementById('ti-description').value = txn.description || '';
  updateCategoryVisibility();                                    // populate options first
  document.getElementById('ti-category').value    = txn.category || ''; // then select value
}

function _resetModal() {
  editingTxnId = null;
  document.getElementById('ti-account').disabled = false;
  _setModalMode('add');
}

/* ─── Open: Add ──────────────────────────────────────────────── */
function openAddTransactionModal() {
  if (accounts.length === 0) {
    toast('Add at least one bank account first.', 'warning');
    return;
  }
  _resetModal();
  const sel = document.getElementById('ti-account');
  sel.innerHTML = '<option value="">— Select account —</option>' + accounts.map(a =>
    `<option value="${escHtml(a.id)}">${escHtml(a.name)} (${escHtml(a.currency)})</option>`
  ).join('');

  document.getElementById('ti-type').value        = 'in';
  document.getElementById('ti-amount').value      = '';
  document.getElementById('ti-description').value = '';
  const now = new Date();
  document.getElementById('ti-date').value =
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  updateCategoryVisibility();
  document.getElementById('txn-modal-overlay').classList.add('modal-overlay--visible');
}

/* ─── Open: Edit ─────────────────────────────────────────────── */
function openEditTransactionModal(txnId) {
  const txn = transactions.find(t => t.id === txnId);
  if (!txn) return;
  editingTxnId = txnId;
  _fillModalFromTxn(txn);
  _setModalMode('edit');
  document.getElementById('txn-modal-overlay').classList.add('modal-overlay--visible');
}

/* ─── Close ──────────────────────────────────────────────────── */
function closeTxnModal(e) {
  if (e && e.target !== document.getElementById('txn-modal-overlay')) return;
  document.getElementById('txn-modal-overlay').classList.remove('modal-overlay--visible');
  _resetModal();
}

/* ─── Save (create or update) ────────────────────────────────── */
async function saveTransaction() {
  const accountId   = document.getElementById('ti-account').value;
  const type        = document.getElementById('ti-type').value;
  const amount      = parseFloat(document.getElementById('ti-amount').value);
  const date        = document.getElementById('ti-date').value;
  const description = document.getElementById('ti-description').value.trim();
  const category    = document.getElementById('ti-category').value || null;

  if (!accountId || isNaN(amount) || amount <= 0 || !date) {
    toast('Please fill in account, amount, and date.', 'error');
    return;
  }

  // Capture before closeTxnModal resets it
  const isEditing      = !!editingTxnId;
  const txnIdToUpdate  = editingTxnId;

  closeTxnModal();

  if (isEditing) {
    await _updateTransaction(txnIdToUpdate, { type, amount, date, description, category });
  } else {
    await _createTransaction({ accountId, type, amount, date, description, category });
  }
}

async function _createTransaction({ accountId, type, amount, date, description, category }) {
  const acct   = accounts.find(a => a.id === accountId);
  const fxRate = acct ? (acct.fxRate || 1) : 1;
  const tempId = Date.now().toString();

  transactions.unshift({
    id: tempId, accountId, type, amount, fxRate,
    amountMXN:   amount * fxRate,
    date, description, category,
    accountName: acct ? acct.name : '',
    currency:    acct ? acct.currency : 'MXN',
  });
  render();

  try {
    const created = await WOS_API.accounts.createTransaction(accountId, {
      type, amount, fxRate, date, description, category,
    });
    const idx = transactions.findIndex(t => t.id === tempId);
    if (idx !== -1) {
      transactions[idx] = {
        ...created,
        accountName: acct ? acct.name : '',
        currency:    created.currency || (acct ? acct.currency : 'MXN'),
      };
    }
    // Apply balance delta to the linked account
    const localDelta = type === 'in' ? amount : -amount;
    const acctIdx    = accounts.findIndex(a => a.id === accountId);
    if (acctIdx !== -1) {
      const a          = accounts[acctIdx];
      const newBalance = (a.balance || 0) + localDelta;
      accounts[acctIdx] = { ...a, balance: newBalance, balanceMXN: newBalance * (a.fxRate || 1) };
      WOS_API.accounts.update(accountId, { ...a, balance: newBalance }).catch(() => {});
    }

    if (typeof logEvent === 'function') {
      const cur = acct ? acct.currency : '';
      logEvent({
        type:     `transaction_${type}`,
        category: 'Transaction',
        icon:     type === 'in' ? '↓' : type === 'invested' ? '◈' : '↑',
        title:    `${type === 'in' ? 'Cash In' : type === 'invested' ? 'Invested' : 'Cash Out'}: ${acct?.name || ''}`,
        detail:   `${cur} ${amount.toLocaleString()}${description ? ' · ' + description : ''} · ${date}`,
        amount:   type === 'in' ? amount * fxRate : -(amount * fxRate),
      });
    }
    toast('Transaction saved.', 'success');
  } catch (_) {
    transactions = transactions.filter(t => t.id !== tempId);
    render();
    toast('Failed to save transaction. Please try again.', 'error');
  }
}

async function _updateTransaction(txnId, { type, amount, date, description, category }) {
  const txn    = transactions.find(t => t.id === txnId);
  if (!txn) return;
  const backup = { ...txn };
  const idx    = transactions.findIndex(t => t.id === txnId);
  const acct   = accounts.find(a => a.id === txn.accountId);
  const fxRate = txn.fxRate || 1;

  // Optimistic update
  transactions[idx] = {
    ...txn,
    type, amount,
    amountMXN:   amount * fxRate,
    date, description, category,
  };
  render();

  try {
    const updated = await WOS_API.accounts.updateTransaction(txn.accountId, txnId, {
      type, amount, fxRate, date, description, category,
      currency: txn.currency,
    });
    const currentIdx = transactions.findIndex(t => t.id === txnId);
    if (currentIdx !== -1) {
      transactions[currentIdx] = {
        ...updated,
        accountName: acct ? acct.name : txn.accountName,
        currency:    updated.currency || txn.currency,
      };
    }
    render();
    toast('Transaction updated.', 'success');
  } catch (_) {
    const restoreIdx = transactions.findIndex(t => t.id === txnId);
    if (restoreIdx !== -1) transactions[restoreIdx] = backup;
    render();
    toast('Failed to update transaction. Please try again.', 'error');
  }
}

/* ─── Delete ─────────────────────────────────────────────────── */
async function deleteTxn(txnId) {
  const txn = transactions.find(t => t.id === txnId);
  if (!txn) return;
  const backup         = [...transactions];
  const backupAccounts = accounts.map(a => ({ ...a }));
  transactions = transactions.filter(t => t.id !== txnId);

  // Optimistically reverse balance delta
  const localDelta = txn.type === 'in' ? -txn.amount : txn.amount;
  const acctIdx    = accounts.findIndex(a => a.id === txn.accountId);
  if (acctIdx !== -1) {
    const a          = accounts[acctIdx];
    const newBalance = (a.balance || 0) + localDelta;
    accounts[acctIdx] = { ...a, balance: newBalance, balanceMXN: newBalance * (a.fxRate || 1) };
  }
  render();

  try {
    await WOS_API.accounts.deleteTransaction(txn.accountId, txnId);
    if (acctIdx !== -1) {
      WOS_API.accounts.update(txn.accountId, { ...accounts[acctIdx] }).catch(() => {});
    }
    toast('Transaction removed.', 'warning');
  } catch (_) {
    transactions = backup;
    accounts.splice(0, accounts.length, ...backupAccounts);
    render();
    toast('Failed to remove transaction. Please try again.', 'error');
  }
}

/* ─── Timeframe filter ───────────────────────────────────────── */
function txnsInTimeframe(txns) {
  if (timeframeFilter === 'custom') {
    return txns.filter(t => {
      const d = t.date || '';
      if (filterDateFrom && d < filterDateFrom) return false;
      if (filterDateTo   && d > filterDateTo)   return false;
      return true;
    });
  }
  if (timeframeFilter === 'all') return txns;
  const now = new Date();
  const yr  = now.getFullYear();
  const mo  = now.getMonth();
  if (timeframeFilter === '1w') {
    const cutoff7 = new Date(now);
    cutoff7.setDate(cutoff7.getDate() - 7);
    const cutoff7Str = cutoff7.toISOString().slice(0, 10);
    return txns.filter(t => (t.date || '') >= cutoff7Str);
  }
  if (timeframeFilter === '1m') {
    const prefix = `${yr}-${String(mo + 1).padStart(2, '0')}`;
    return txns.filter(t => (t.date || '').startsWith(prefix));
  }
  let cutoff;
  if (timeframeFilter === '3m')  cutoff = new Date(yr, mo - 2, 1);
  if (timeframeFilter === 'ytd') cutoff = new Date(yr, 0, 1);
  if (timeframeFilter === '1y')  cutoff = new Date(yr, mo - 11, 1);
  const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}`;
  return txns.filter(t => (t.date || '') >= cutoffStr);
}

function getFlowMonths() {
  const now = new Date();
  const yr  = now.getFullYear();
  const mo  = now.getMonth();
  const months = [];

  function pushMonth(d) {
    months.push({
      label: d.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' }),
      key:   `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    });
  }

  if (timeframeFilter === '1w') {
    pushMonth(new Date(yr, mo, 1));
  } else if (timeframeFilter === 'ytd') {
    for (let m = 0; m <= mo; m++) pushMonth(new Date(yr, m, 1));
  } else if (timeframeFilter === '1m') {
    pushMonth(new Date(yr, mo, 1));
  } else if (timeframeFilter === '3m') {
    for (let i = 2; i >= 0; i--) pushMonth(new Date(yr, mo - i, 1));
  } else if (timeframeFilter === '1y') {
    for (let i = 11; i >= 0; i--) pushMonth(new Date(yr, mo - i, 1));
  } else if (timeframeFilter === 'custom' && (filterDateFrom || filterDateTo)) {
    const start = filterDateFrom
      ? new Date(filterDateFrom + 'T00:00:00')
      : new Date(yr, mo - 23, 1);
    const end   = filterDateTo
      ? new Date(filterDateTo + 'T00:00:00')
      : new Date(yr, mo, 1);
    let d = new Date(start.getFullYear(), start.getMonth(), 1);
    const endKey = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}`;
    while (months.length < 60) {
      pushMonth(new Date(d));
      const curKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (curKey >= endKey) break;
      d.setMonth(d.getMonth() + 1);
    }
  } else {
    // 'all' — span from earliest transaction, capped at 24 months back
    const dates = transactions.map(t => t.date || '').filter(Boolean).sort();
    let start;
    if (dates.length > 0) {
      const firstYr = parseInt(dates[0].slice(0, 4));
      const firstMo = parseInt(dates[0].slice(5, 7)) - 1;
      const cap     = new Date(yr, mo - 23, 1);
      start = new Date(Math.max(new Date(firstYr, firstMo, 1).getTime(), cap.getTime()));
    } else {
      start = new Date(yr, mo - 5, 1);
    }
    let d = new Date(start);
    while (d.getFullYear() < yr || (d.getFullYear() === yr && d.getMonth() <= mo)) {
      pushMonth(new Date(d));
      d.setMonth(d.getMonth() + 1);
    }
  }
  return months;
}

function setTimeframe(tf) {
  timeframeFilter = tf;
  chartBarFilter  = null;
  currentPage     = 1;
  document.querySelectorAll('.tf-filter__btn').forEach(btn => {
    btn.classList.toggle('tf-filter__btn--active', btn.dataset.tf === tf);
  });
  render();
}

/* ─── Date filter (tab-group) ────────────────────────────────── */
function setRange(range, btn) {
  document.querySelectorAll('.tab-group .tab').forEach(t => t.classList.remove('tab--active'));
  if (btn) btn.classList.add('tab--active');

  const row = document.getElementById('date-range-row');
  if (range === 'custom') {
    row.classList.add('date-range-row--visible');
    timeframeFilter = 'custom';
  } else {
    row.classList.remove('date-range-row--visible');
    timeframeFilter = range;
  }

  currentPage    = 1;
  chartBarFilter = null;
  render();
}

function setFlowFilter(type) {
  filterType     = filterType === type ? '' : type;
  flowView       = filterType || null;
  chartBarFilter = null;
  currentPage    = 1;

  document.querySelectorAll('.filter-pill[data-flow]').forEach(btn => {
    btn.classList.toggle('filter-pill--active', btn.dataset.flow === filterType);
  });
  ['all', 'in', 'out', 'invested'].forEach(v => {
    const btn = document.getElementById(`cf-btn-${v}`);
    if (btn) btn.classList.toggle('cf-filter__btn--active', v === 'all' ? flowView === null : v === flowView);
  });

  render();
}

function applyCustomRange() {
  filterDateFrom  = document.getElementById('date-start').value;
  filterDateTo    = document.getElementById('date-end').value;
  timeframeFilter = 'custom';
  currentPage     = 1;
  render();
}

/* ─── Filter / Sort ──────────────────────────────────────────── */
function filterTable(text) {
  filterText  = (text || '').toLowerCase();
  currentPage = 1;
  renderTable();
}

function sortBy(col) {
  if (sortCol === col) {
    sortDir *= -1;
  } else {
    sortCol = col;
    sortDir = col === 'date' ? -1 : 1;
  }
  document.querySelectorAll('.th-sort').forEach(th => th.classList.remove('th-sort--active'));
  const active = document.querySelector(`.th-sort[data-col="${col}"]`);
  if (active) active.classList.add('th-sort--active');
  currentPage = 1;
  renderTable();
}

function getFiltered() {
  return txnsInTimeframe(transactions).filter(t => {
    const matchText = !filterText ||
      (t.description  || '').toLowerCase().includes(filterText) ||
      (t.accountName  || '').toLowerCase().includes(filterText) ||
      (t.type         || '').toLowerCase().includes(filterText) ||
      catLabel(t.category).toLowerCase().includes(filterText);
    const matchType = !filterType || t.type === filterType;
    const matchBar  = !chartBarFilter ||
      (t.type === chartBarFilter.type && (t.date || '').startsWith(chartBarFilter.key));
    return matchText && matchType && matchBar;
  });
}

function clearBarFilter() {
  chartBarFilter = null;
  currentPage    = 1;
  renderTable();
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
  renderCharts();
  renderTable();
}

function updateSummary() {
  const yr = new Date().getFullYear().toString();
  const ytd = type => transactions
    .filter(t => t.type === type && (t.date || '').startsWith(yr))
    .reduce((s, t) => s + (t.amountMXN || 0), 0);

  const inYTD   = ytd('in');
  const outYTD  = ytd('out');
  const invYTD  = ytd('invested');
  const netFlow = inYTD - outYTD;

  document.getElementById('sum-cash-in').textContent  = fmtMXN(inYTD);
  document.getElementById('sum-cash-out').textContent = fmtMXN(outYTD);
  document.getElementById('sum-invested').textContent = fmtMXN(invYTD);

  const netEl = document.getElementById('sum-net-flow');
  netEl.textContent = fmtMXN(netFlow);
  netEl.style.color = netFlow >= 0 ? 'var(--up)' : 'var(--down)';
}

function updateKPIs() {
  const scoped    = txnsInTimeframe(transactions);
  const filtered  = filterType ? scoped.filter(t => t.type === filterType) : scoped;
  const sumType   = type => filtered.filter(t => t.type === type).reduce((s, t) => s + (t.amountMXN || 0), 0);
  const countType = type => filtered.filter(t => t.type === type).length;

  const totalIn  = sumType('in');
  const totalOut = sumType('out');
  const totalInv = sumType('invested');
  const netFlow  = totalIn - totalOut;

  const cntIn  = countType('in');
  const cntOut = countType('out');
  const cntInv = countType('invested');

  document.getElementById('k-total-in').textContent       = fmtMXN(totalIn);
  document.getElementById('k-in-count').textContent       = `${cntIn} transaction${cntIn !== 1 ? 's' : ''}`;
  document.getElementById('k-total-out').textContent      = fmtMXN(totalOut);
  document.getElementById('k-out-count').textContent      = `${cntOut} transaction${cntOut !== 1 ? 's' : ''}`;
  document.getElementById('k-total-invested').textContent = fmtMXN(totalInv);
  document.getElementById('k-invested-count').textContent = `${cntInv} transaction${cntInv !== 1 ? 's' : ''}`;

  const netEl = document.getElementById('k-net-flow');
  netEl.textContent = fmtMXN(netFlow);
  netEl.style.color = netFlow >= 0 ? 'var(--up)' : 'var(--down)';

  const tfLabels = { all: 'All Time', '1m': 'This Month', '3m': 'Last 3M', ytd: 'YTD', '1y': 'Last 12M' };
  const labelEl  = document.getElementById('k-net-flow-label');
  if (labelEl) labelEl.textContent = `Net Flow (${tfLabels[timeframeFilter] || 'All Time'})`;
}

function renderTable() {
  const tbody      = document.getElementById('body-txn');
  const counter    = document.getElementById('table-count');
  const list       = getSorted(getFiltered());
  const total      = list.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1)          currentPage = 1;

  const start     = (currentPage - 1) * PAGE_SIZE;
  const pageItems = list.slice(start, start + PAGE_SIZE);

  counter.textContent = `${total} transaction${total !== 1 ? 's' : ''}`;

  const chip = document.getElementById('bar-filter-chip');
  if (chip) {
    if (chartBarFilter) {
      const typeLabels = { in: 'Cash In', out: 'Cash Out', invested: 'Invested' };
      chip.textContent = `${typeLabels[chartBarFilter.type]} · ${chartBarFilter.key} ×`;
      chip.style.display = '';
    } else {
      chip.style.display = 'none';
    }
  }

  if (total === 0) {
    const msg = transactions.length === 0
      ? 'No transactions yet. Add your first transaction.'
      : 'No transactions match the current filter.';
    tbody.innerHTML = `<tr><td colspan="8" class="table__empty">${msg}</td></tr>`;
    renderPagination(1, 1, 0);
    return;
  }

  tbody.innerHTML = pageItems.map(t => {
    const dateLabel = t.date
      ? new Date(t.date + 'T00:00:00').toLocaleDateString(window.WOS_LOCALE || 'en-US', {
          month: 'short', day: 'numeric', year: 'numeric'
        })
      : '—';

    const typeLabel = t.type === 'in' ? 'Cash In ↑' : t.type === 'out' ? 'Cash Out ↓' : 'Invested ◈';
    const typeCls   = `txn-type-badge txn-type-badge--${t.type}`;
    const cat       = t.category && CATEGORIES[t.category];
    const catCell   = cat
      ? `<span class="txn-cat-badge" style="color:${cat.color};background:${cat.color}1a;border-color:${cat.color}40">${cat.label}</span>`
      : `<span style="color:var(--text-tertiary);font-family:var(--font-mono);font-size:11px">—</span>`;
    const amtLocal  = fmtLocal(t.amount, t.currency || 'MXN');
    const amtMXN    = fmtMXN(t.amountMXN);
    const desc      = t.description
      ? escHtml(t.description)
      : `<span style="color:var(--text-tertiary)">—</span>`;

    return `
    <tr class="table-row">
      <td class="td--muted">${dateLabel}</td>
      <td class="td--name">${desc}</td>
      <td class="td--ticker">${escHtml(t.accountName || '—')}</td>
      <td><span class="${typeCls}">${typeLabel}</span></td>
      <td>${catCell}</td>
      <td class="td--price">${amtLocal}</td>
      <td class="td--price">${amtMXN}</td>
      <td>
        <div class="acct-row-actions">
          <button class="acct-btn-edit" onclick="openEditTransactionModal('${escHtml(t.id)}')" title="Edit">✎</button>
          <button class="txn-btn-remove" onclick="deleteTxn('${escHtml(t.id)}')" title="Remove">✕</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  renderPagination(currentPage, totalPages, total);
}

function goToPage(n) {
  currentPage = n;
  renderTable();
  document.getElementById('txn-table-wrapper').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderPagination(page, totalPages, total) {
  const bar = document.getElementById('pagination-bar');
  if (!bar) return;
  if (totalPages <= 1) { bar.innerHTML = ''; return; }

  const start      = (page - 1) * PAGE_SIZE + 1;
  const end        = Math.min(page * PAGE_SIZE, total);
  const rangeLabel = `${start}–${end} of ${total}`;

  function pageButtons() {
    const btns  = [];
    const delta = 2;
    const left  = page - delta;
    const right = page + delta;
    let lastPushed = null;

    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= left && i <= right)) {
        if (lastPushed !== null && i - lastPushed > 1) {
          btns.push('<span class="pg-ellipsis">…</span>');
        }
        btns.push(
          `<button class="pg-btn${i === page ? ' pg-btn--active' : ''}" onclick="goToPage(${i})">${i}</button>`
        );
        lastPushed = i;
      }
    }
    return btns.join('');
  }

  bar.innerHTML = `
    <div class="pg-range">${rangeLabel}</div>
    <div class="pg-controls">
      <button class="pg-btn pg-btn--nav" onclick="goToPage(${page - 1})" ${page === 1 ? 'disabled' : ''}>‹</button>
      ${pageButtons()}
      <button class="pg-btn pg-btn--nav" onclick="goToPage(${page + 1})" ${page === totalPages ? 'disabled' : ''}>›</button>
    </div>`;
}

/* ─── Category chart period filter ──────────────────────────── */
function populateCatFilterYears(scopedTxns, typeOverride) {
  const sel = document.getElementById('cat-filter-year');
  if (!sel) return;

  const src        = scopedTxns || transactions;
  const effectType = typeOverride || catFilterType;
  const years = [...new Set(
    src
      .filter(t => t.type === effectType && t.date)
      .map(t => t.date.slice(0, 4))
  )].sort().reverse();

  const prev = catFilterYear;
  sel.innerHTML = '<option value="">All Time</option>' +
    years.map(y => `<option value="${y}">${y}</option>`).join('');

  if (years.includes(prev)) {
    sel.value = prev;
  } else {
    sel.value = '';
    catFilterYear  = '';
    catFilterMonth = '';
    const monthSel = document.getElementById('cat-filter-month');
    if (monthSel) { monthSel.value = ''; monthSel.disabled = true; }
  }
}

function updateCatFilter() {
  catFilterType = document.getElementById('cat-filter-type').value;
  catFilterYear = document.getElementById('cat-filter-year').value;
  const monthSel = document.getElementById('cat-filter-month');

  monthSel.disabled = !catFilterYear;
  if (!catFilterYear) {
    catFilterMonth = '';
    monthSel.value = '';
  } else {
    catFilterMonth = monthSel.value;
  }

  renderCategoryChart();
}

/* ─── Flow chart filter ──────────────────────────────────────── */
function setFlowView(view) {
  flowView = view;
  ['all', 'in', 'out', 'invested'].forEach(v => {
    const btn = document.getElementById(`cf-btn-${v}`);
    if (btn) btn.classList.toggle('cf-filter__btn--active', v === 'all' ? view === null : v === view);
  });
  renderFlowChart();
}

/* ─── Charts ─────────────────────────────────────────────────── */
function renderCharts() {
  renderFlowChart();
  renderCategoryChart();
}

function renderFlowChart() {
  const months = getFlowMonths();
  flowMonths = months;

  const sumType = (type, key) => transactions
    .filter(t => t.type === type && (t.date || '').startsWith(key))
    .reduce((s, t) => s + (t.amountMXN || 0), 0);

  const allDatasets = [
    { id: 'in',       label: 'Cash In',  data: months.map(m => sumType('in',       m.key)), backgroundColor: 'rgba(52,211,153,0.65)',  borderColor: '#34d399', borderWidth: 1, borderRadius: 4, stack: 'inflow'  },
    { id: 'out',      label: 'Cash Out', data: months.map(m => sumType('out',      m.key)), backgroundColor: 'rgba(248,113,113,0.65)', borderColor: '#f87171', borderWidth: 1, borderRadius: 4, stack: 'outflow' },
    { id: 'invested', label: 'Invested', data: months.map(m => sumType('invested', m.key)), backgroundColor: 'rgba(99,102,241,0.65)',  borderColor: '#6366f1', borderWidth: 1, borderRadius: 4, stack: 'outflow' },
  ];

  const datasets = flowView ? allDatasets.filter(d => d.id === flowView) : allDatasets;

  // When showing all types, extend the y ceiling to 122% of the tallest stack so
  // net labels live inside the plot area and never touch the chart legend above it.
  let yMax;
  if (!flowView) {
    const stackedPeak = months.reduce((max, _, i) => {
      const inflow  = allDatasets[0].data[i] || 0;
      const outflow = (allDatasets[1].data[i] || 0) + (allDatasets[2].data[i] || 0);
      return Math.max(max, inflow, outflow);
    }, 0);
    if (stackedPeak > 0) yMax = stackedPeak * 1.22;
  }

  const ctx = document.getElementById('chart-flow').getContext('2d');
  if (chartFlow) chartFlow.destroy();

  // Inline plugin: draws compact net (Cash In − Cash Out − Invested) above each column
  const netPlugin = {
    id: 'netFlowLabels',
    afterDraw(chart) {
      if (flowView !== null) return;
      const { ctx: c, scales, data } = chart;
      const ds     = data.datasets;
      const inIdx  = ds.findIndex(d => d.id === 'in');
      const outIdx = ds.findIndex(d => d.id === 'out');
      const invIdx = ds.findIndex(d => d.id === 'invested');
      if (inIdx === -1) return;

      const inMeta  = chart.getDatasetMeta(inIdx);
      const outMeta = outIdx !== -1 ? chart.getDatasetMeta(outIdx) : null;
      const invMeta = invIdx !== -1 ? chart.getDatasetMeta(invIdx) : null;
      const zero    = scales.y.getPixelForValue(0);
      // Hard floor: labels must stay within the plot area, never in the legend zone
      const floor   = chart.chartArea.top + 4;

      ds[inIdx].data.forEach((inVal, i) => {
        const outVal = outIdx !== -1 ? (ds[outIdx].data[i] || 0) : 0;
        const invVal = invIdx !== -1 ? (ds[invIdx].data[i] || 0) : 0;
        if (inVal === 0 && outVal === 0 && invVal === 0) return;

        const net     = inVal - (outVal + invVal);
        const inTopY  = inVal > 0 ? inMeta.data[i].y : zero;
        const outTopY = invMeta ? invMeta.data[i].y : (outMeta ? outMeta.data[i].y : zero);
        const highY   = Math.min(inTopY, outTopY);

        // center x between the two bar groups
        const inX  = inMeta.data[i].x;
        const outX = invMeta ? invMeta.data[i].x : (outMeta ? outMeta.data[i].x : inX);
        const x    = (inX + outX) / 2;

        const abs   = Math.abs(net);
        const sign  = net >= 0 ? '+' : '−';
        const label = abs >= 1e6 ? `${sign}${(abs / 1e6).toFixed(1)}M`
                    : abs >= 1e3 ? `${sign}${(abs / 1e3).toFixed(1)}k`
                    :              `${sign}${Math.round(abs)}`;

        const color = net >= 0 ? '#34d399' : '#f87171';
        const lineY = Math.max(highY - 10, floor);

        c.save();
        c.beginPath();
        c.strokeStyle = color + '60';
        c.lineWidth   = 1.5;
        c.moveTo(x - 14, lineY);
        c.lineTo(x + 14, lineY);
        c.stroke();

        c.font         = "500 9.5px 'DM Mono', monospace";
        c.fillStyle    = color + 'cc';
        c.textAlign    = 'center';
        c.textBaseline = 'bottom';
        c.fillText(label, x, lineY - 2);
        c.restore();
      });
    },
  };

  chartFlow = new Chart(ctx, {
    type: 'bar',
    data: { labels: months.map(m => m.label), datasets },
    plugins: [netPlugin],
    options: {
      responsive: true, maintainAspectRatio: false,
      onHover: (e, els) => { e.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
      onClick(event, elements, chart) {
        if (!elements.length) {
          chartBarFilter = null;
          currentPage    = 1;
          renderTable();
          return;
        }
        const el   = elements[0];
        const type = chart.data.datasets[el.datasetIndex].id;
        const key  = flowMonths[el.index]?.key;
        if (!type || !key) return;
        if (chartBarFilter && chartBarFilter.key === key && chartBarFilter.type === type) {
          chartBarFilter = null;
        } else {
          chartBarFilter = { key, type };
        }
        currentPage = 1;
        renderTable();
      },
      plugins: {
        legend: { position: 'bottom', labels: { color: '#8892a4', font: { family: "'DM Mono'", size: 11 }, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8, padding: 16 } },
        tooltip: { backgroundColor: '#111525', borderColor: '#1e2640', borderWidth: 1, titleColor: '#eef0ff', bodyColor: '#8892a4', titleFont: { family: "'DM Sans'", size: 13 }, bodyFont: { family: "'DM Mono'", size: 11 }, callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmtMXN(ctx.parsed.y)}` } },
      },
      scales: {
        x: { stacked: true, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#8892a4', font: { family: "'DM Mono'", size: 11 } } },
        y: { stacked: true, max: yMax, grid: { color: 'rgba(255,255,255,0.04)' }, border: { dash: [3,3] }, ticks: { color: '#8892a4', font: { family: "'DM Mono'", size: 10 }, callback: v => v === 0 ? '0' : fmtMXN(v) } },
      },
    },
  });
}

function renderCategoryChart() {
  const scoped       = txnsInTimeframe(transactions);
  const effectType   = filterType || catFilterType;
  populateCatFilterYears(scoped, effectType);

  let typeTxns = scoped.filter(t => t.type === effectType);
  if (catFilterYear) {
    typeTxns = typeTxns.filter(t => (t.date || '').startsWith(catFilterYear));
    if (catFilterMonth) {
      typeTxns = typeTxns.filter(t => (t.date || '').slice(5, 7) === catFilterMonth);
    }
  }

  const ctx = document.getElementById('chart-breakdown').getContext('2d');
  if (chartCategory) chartCategory.destroy();

  if (typeTxns.length === 0) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    chartCategory = null;
    return;
  }

  const groups = {};
  typeTxns.forEach(t => {
    const key = t.category || 'uncategorized';
    groups[key] = (groups[key] || 0) + (t.amountMXN || 0);
  });

  const catOrder   = [...(CATS_BY_TYPE[catFilterType] || []), 'transfers', 'uncategorized'];
  const uncatColor = '#a78bfa';
  const labels = [], data = [], colors = [];

  catOrder.forEach(key => {
    if ((groups[key] || 0) > 0) {
      labels.push(key === 'uncategorized' ? 'Sin categoría' : CATEGORIES[key].label);
      data.push(groups[key]);
      colors.push(key === 'uncategorized' ? uncatColor : CATEGORIES[key].color);
    }
  });

  const total = data.reduce((s, v) => s + v, 0);

  chartCategory = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors.map(c => c + 'b3'), borderColor: colors, hoverBorderColor: colors, borderWidth: 1, hoverOffset: 6 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '66%',
      plugins: {
        legend: { position: 'right', labels: { color: '#8892a4', font: { family: "'DM Mono'", size: 11 }, padding: 14, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8 } },
        tooltip: { backgroundColor: '#111525', borderColor: '#1e2640', borderWidth: 1, titleColor: '#eef0ff', bodyColor: '#8892a4', titleFont: { family: "'DM Sans'", size: 13 }, bodyFont: { family: "'DM Mono'", size: 11 }, callbacks: { label: ctx => ` ${fmtMXN(ctx.parsed)} (${total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0}%)` } },
      },
    },
  });
}

/* ─── Export ─────────────────────────────────────────────────── */
document.getElementById('export-btn').addEventListener('click', () => {
  if (transactions.length === 0) { toast('No transactions to export.', 'warning'); return; }
  const header = ['Date','Description','Account','Type','Category','Amount (local)','Currency','Amount (MXN)'];
  const rows   = transactions.map(t =>
    [t.date||'', t.description||'', t.accountName||'', t.type, catLabel(t.category), t.amount, t.currency||'MXN', (t.amountMXN||0).toFixed(2)]
    .map(v => `"${String(v).replace(/"/g,'""')}"`)
    .join(',')
  );
  const csv  = [header.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `wealthos-transactions-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Exported to CSV.', 'success');
});

/* ─── Formatting helpers ─────────────────────────────────────── */
function catLabel(cat) {
  return cat && CATEGORIES[cat] ? CATEGORIES[cat].label : '';
}

function fmtMXN(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(n || 0);
}

function fmtLocal(n, currency) {
  try {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
  } catch {
    return `${currency} ${(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ─── Toast ──────────────────────────────────────────────────── */
function toast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const el        = document.createElement('div');
  el.className    = `toast toast--${type}`;
  el.textContent  = msg;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('toast--visible'));
  setTimeout(() => { el.classList.remove('toast--visible'); setTimeout(() => el.remove(), 350); }, 3000);
}
