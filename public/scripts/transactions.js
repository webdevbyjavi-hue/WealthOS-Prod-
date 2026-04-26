/* ══════════════════════════════════════════════════════════════
   WealthOS — Transactions Page
══════════════════════════════════════════════════════════════ */

/* ─── Expense categories ─────────────────────────────────────── */
const EXPENSE_CATEGORIES = {
  fixed:       { label: 'Fixed Expenses',    color: '#fbbf24' },
  variable:    { label: 'Variable Expenses', color: '#60a5fa' },
  credit_card: { label: 'Credit Cards',      color: '#f87171' },
  transfers:   { label: 'Transfers',         color: '#94a3b8' },
};

/* ─── State ──────────────────────────────────────────────────── */
let accounts     = [];
let transactions = [];
let editingTxnId = null;
let flowView     = null; // null = all, 'in', 'out', 'invested'
let sortCol      = 'date';
let sortDir      = -1;
let filterText     = '';
let filterType     = '';
let catFilterYear  = '';
let catFilterMonth = '';
let currentPage    = 1;
const PAGE_SIZE    = 20;

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

/* ─── Category visibility helper ─────────────────────────────── */
function updateCategoryVisibility() {
  const type  = document.getElementById('ti-type').value;
  const group = document.getElementById('ti-category-group');
  if (!group) return;
  group.style.display = type === 'out' ? 'block' : 'none';
  if (type !== 'out') document.getElementById('ti-category').value = '';
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
  sel.innerHTML = accounts.map(a =>
    `<option value="${escHtml(a.id)}">${escHtml(a.name)} (${escHtml(a.currency)})</option>`
  ).join('');
  sel.value = txn.accountId;

  document.getElementById('ti-type').value        = txn.type;
  document.getElementById('ti-amount').value      = txn.amount;
  document.getElementById('ti-date').value        = txn.date || '';
  document.getElementById('ti-description').value = txn.description || '';
  document.getElementById('ti-category').value    = txn.category || '';
  updateCategoryVisibility();
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
  sel.innerHTML = accounts.map(a =>
    `<option value="${escHtml(a.id)}">${escHtml(a.name)} (${escHtml(a.currency)})</option>`
  ).join('');

  document.getElementById('ti-type').value        = 'in';
  document.getElementById('ti-amount').value      = '';
  document.getElementById('ti-description').value = '';
  document.getElementById('ti-category').value    = '';
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
  const category    = type === 'out' ? (document.getElementById('ti-category').value || null) : null;

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
  const backup = [...transactions];
  transactions = transactions.filter(t => t.id !== txnId);
  render();
  try {
    await WOS_API.accounts.deleteTransaction(txn.accountId, txnId);
    toast('Transaction removed.', 'warning');
  } catch (_) {
    transactions = backup;
    render();
    toast('Failed to remove transaction. Please try again.', 'error');
  }
}

/* ─── Filter / Sort ──────────────────────────────────────────── */
function filterTable(text) {
  filterText  = text.toLowerCase();
  filterType  = document.getElementById('filter-type').value;
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
  return transactions.filter(t => {
    const matchText = !filterText ||
      (t.description  || '').toLowerCase().includes(filterText) ||
      (t.accountName  || '').toLowerCase().includes(filterText) ||
      (t.type         || '').toLowerCase().includes(filterText) ||
      catLabel(t.category).toLowerCase().includes(filterText);
    const matchType = !filterType || t.type === filterType;
    return matchText && matchType;
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
  const sumType   = type => transactions
    .filter(t => t.type === type)
    .reduce((s, t) => s + (t.amountMXN || 0), 0);
  const countType = type => transactions.filter(t => t.type === type).length;

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
    const catCell   = t.category && EXPENSE_CATEGORIES[t.category]
      ? `<span class="txn-cat-badge txn-cat-badge--${t.category}">${EXPENSE_CATEGORIES[t.category].label}</span>`
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
function populateCatFilterYears() {
  const sel = document.getElementById('cat-filter-year');
  if (!sel) return;

  const years = [...new Set(
    transactions
      .filter(t => t.type === 'out' && t.date)
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
  const months = [];
  const now    = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      label: d.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' }),
      key:   `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    });
  }

  const sumType = (type, key) => transactions
    .filter(t => t.type === type && (t.date || '').startsWith(key))
    .reduce((s, t) => s + (t.amountMXN || 0), 0);

  const allDatasets = [
    { id: 'in',       label: 'Cash In',  data: months.map(m => sumType('in',       m.key)), backgroundColor: 'rgba(52,211,153,0.65)',  borderColor: '#34d399', borderWidth: 1, borderRadius: 4, stack: 'inflow'  },
    { id: 'out',      label: 'Cash Out', data: months.map(m => sumType('out',      m.key)), backgroundColor: 'rgba(248,113,113,0.65)', borderColor: '#f87171', borderWidth: 1, borderRadius: 0, stack: 'outflow' },
    { id: 'invested', label: 'Invested', data: months.map(m => sumType('invested', m.key)), backgroundColor: 'rgba(99,102,241,0.65)',  borderColor: '#6366f1', borderWidth: 1, borderRadius: 4, stack: 'outflow' },
  ];

  const datasets = flowView ? allDatasets.filter(d => d.id === flowView) : allDatasets;
  const ctx = document.getElementById('chart-flow').getContext('2d');
  if (chartFlow) chartFlow.destroy();

  chartFlow = new Chart(ctx, {
    type: 'bar',
    data: { labels: months.map(m => m.label), datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { color: '#8892a4', font: { family: "'DM Mono'", size: 11 }, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8, padding: 16 } },
        tooltip: { backgroundColor: '#111525', borderColor: '#1e2640', borderWidth: 1, titleColor: '#eef0ff', bodyColor: '#8892a4', titleFont: { family: "'DM Sans'", size: 13 }, bodyFont: { family: "'DM Mono'", size: 11 }, callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmtMXN(ctx.parsed.y)}` } },
      },
      scales: {
        x: { stacked: true, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#8892a4', font: { family: "'DM Mono'", size: 11 } } },
        y: { stacked: true, grid: { color: 'rgba(255,255,255,0.04)' }, border: { dash: [3,3] }, ticks: { color: '#8892a4', font: { family: "'DM Mono'", size: 10 }, callback: v => v === 0 ? '0' : fmtMXN(v) } },
      },
    },
  });
}

function renderCategoryChart() {
  populateCatFilterYears();

  let outTxns = transactions.filter(t => t.type === 'out');
  if (catFilterYear) {
    outTxns = outTxns.filter(t => (t.date || '').startsWith(catFilterYear));
    if (catFilterMonth) {
      outTxns = outTxns.filter(t => (t.date || '').slice(5, 7) === catFilterMonth);
    }
  }

  const ctx = document.getElementById('chart-breakdown').getContext('2d');
  if (chartCategory) chartCategory.destroy();

  if (outTxns.length === 0) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    chartCategory = null;
    return;
  }

  const groups = {};
  outTxns.forEach(t => {
    const key = t.category || 'uncategorized';
    groups[key] = (groups[key] || 0) + (t.amountMXN || 0);
  });

  const catOrder   = ['fixed', 'variable', 'credit_card', 'transfers', 'uncategorized'];
  const uncatColor = '#a78bfa';
  const labels = [], data = [], colors = [];

  catOrder.forEach(key => {
    if (groups[key] > 0) {
      labels.push(key === 'uncategorized' ? 'Uncategorized' : EXPENSE_CATEGORIES[key].label);
      data.push(groups[key]);
      colors.push(key === 'uncategorized' ? uncatColor : EXPENSE_CATEGORIES[key].color);
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
  return cat && EXPENSE_CATEGORIES[cat] ? EXPENSE_CATEGORIES[cat].label : '';
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
