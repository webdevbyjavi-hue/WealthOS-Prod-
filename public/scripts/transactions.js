/* ══════════════════════════════════════════════════════════════
   WealthOS — Transactions Page
══════════════════════════════════════════════════════════════ */

/* ─── State ──────────────────────────────────────────────────── */
let accounts     = [];
let transactions = [];
let flowView     = null; // null = all, 'in', 'out', 'invested'
let sortCol      = 'date';
let sortDir      = -1;   // newest first by default
let filterText   = '';
let filterType   = '';

/* ─── Chart instances ─────────────────────────────────────────── */
let chartFlow      = null;
let chartBreakdown = null;

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

/* ─── Transaction Modal ──────────────────────────────────────── */
function openAddTransactionModal() {
  if (accounts.length === 0) {
    toast('Add at least one bank account first.', 'warning');
    return;
  }
  const sel = document.getElementById('ti-account');
  sel.innerHTML = accounts.map(a =>
    `<option value="${escHtml(a.id)}">${escHtml(a.name)} (${escHtml(a.currency)})</option>`
  ).join('');
  document.getElementById('ti-type').value        = 'in';
  document.getElementById('ti-amount').value      = '';
  document.getElementById('ti-description').value = '';
  const now = new Date();
  document.getElementById('ti-date').value =
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  document.getElementById('txn-modal-overlay').classList.add('modal-overlay--visible');
}

function closeTxnModal(e) {
  if (e && e.target !== document.getElementById('txn-modal-overlay')) return;
  document.getElementById('txn-modal-overlay').classList.remove('modal-overlay--visible');
}

async function saveTransaction() {
  const accountId   = document.getElementById('ti-account').value;
  const type        = document.getElementById('ti-type').value;
  const amount      = parseFloat(document.getElementById('ti-amount').value);
  const date        = document.getElementById('ti-date').value;
  const description = document.getElementById('ti-description').value.trim();

  if (!accountId || isNaN(amount) || amount <= 0 || !date) {
    toast('Please fill in account, amount, and date.', 'error');
    return;
  }

  const acct   = accounts.find(a => a.id === accountId);
  const fxRate = acct ? (acct.fxRate || 1) : 1;
  const tempId = Date.now().toString();

  const localTxn = {
    id:          tempId,
    accountId,
    type,
    amount,
    fxRate,
    amountMXN:   amount * fxRate,
    date,
    description,
    accountName: acct ? acct.name : '',
    currency:    acct ? acct.currency : 'MXN',
  };

  transactions.unshift(localTxn);
  closeTxnModal();
  render();

  try {
    const created = await WOS_API.accounts.createTransaction(accountId, {
      type, amount, fxRate, date, description,
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
  filterText = text.toLowerCase();
  filterType = document.getElementById('filter-type').value;
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
  renderTable();
}

function getFiltered() {
  return transactions.filter(t => {
    const matchText = !filterText ||
      (t.description  || '').toLowerCase().includes(filterText) ||
      (t.accountName  || '').toLowerCase().includes(filterText) ||
      (t.type         || '').toLowerCase().includes(filterText);
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

  const inYTD       = ytd('in');
  const outYTD      = ytd('out');
  const investedYTD = ytd('invested');
  const netFlow     = inYTD - outYTD;

  document.getElementById('sum-cash-in').textContent  = fmtMXN(inYTD);
  document.getElementById('sum-cash-out').textContent = fmtMXN(outYTD);
  document.getElementById('sum-invested').textContent = fmtMXN(investedYTD);

  const netEl = document.getElementById('sum-net-flow');
  netEl.textContent = fmtMXN(netFlow);
  netEl.style.color = netFlow >= 0 ? 'var(--up)' : 'var(--down)';
}

function updateKPIs() {
  const sumType   = type => transactions
    .filter(t => t.type === type)
    .reduce((s, t) => s + (t.amountMXN || 0), 0);
  const countType = type => transactions.filter(t => t.type === type).length;

  const totalIn       = sumType('in');
  const totalOut      = sumType('out');
  const totalInvested = sumType('invested');
  const netFlow       = totalIn - totalOut;

  const cntIn  = countType('in');
  const cntOut = countType('out');
  const cntInv = countType('invested');

  document.getElementById('k-total-in').textContent       = fmtMXN(totalIn);
  document.getElementById('k-in-count').textContent       = `${cntIn} transaction${cntIn !== 1 ? 's' : ''}`;
  document.getElementById('k-total-out').textContent      = fmtMXN(totalOut);
  document.getElementById('k-out-count').textContent      = `${cntOut} transaction${cntOut !== 1 ? 's' : ''}`;
  document.getElementById('k-total-invested').textContent = fmtMXN(totalInvested);
  document.getElementById('k-invested-count').textContent = `${cntInv} transaction${cntInv !== 1 ? 's' : ''}`;

  const netEl = document.getElementById('k-net-flow');
  netEl.textContent = fmtMXN(netFlow);
  netEl.style.color = netFlow >= 0 ? 'var(--up)' : 'var(--down)';
}

function renderTable() {
  const tbody   = document.getElementById('body-txn');
  const counter = document.getElementById('table-count');
  const list    = getSorted(getFiltered());

  counter.textContent = `${list.length} transaction${list.length !== 1 ? 's' : ''}`;

  if (list.length === 0) {
    const msg = transactions.length === 0
      ? 'No transactions yet. Add your first transaction.'
      : 'No transactions match the current filter.';
    tbody.innerHTML = `<tr><td colspan="7" class="table__empty">${msg}</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(t => {
    const dateLabel = t.date
      ? new Date(t.date + 'T00:00:00').toLocaleDateString(window.WOS_LOCALE || 'en-US', {
          month: 'short', day: 'numeric', year: 'numeric'
        })
      : '—';

    const typeLabel = t.type === 'in' ? 'Cash In ↑' : t.type === 'out' ? 'Cash Out ↓' : 'Invested ◈';
    const typeCls   = `txn-type-badge txn-type-badge--${t.type}`;
    const amtLocal  = fmtLocal(t.amount, t.currency || 'MXN');
    const amtMXN    = fmtMXN(t.amountMXN);
    const desc      = t.description ? escHtml(t.description) : '<span style="color:var(--text-tertiary)">—</span>';
    const acctName  = escHtml(t.accountName || '—');

    return `
    <tr class="table-row">
      <td class="td--muted">${dateLabel}</td>
      <td class="td--name">${desc}</td>
      <td class="td--ticker">${acctName}</td>
      <td><span class="${typeCls}">${typeLabel}</span></td>
      <td class="td--price">${amtLocal}</td>
      <td class="td--price">${amtMXN}</td>
      <td>
        <button class="txn-btn-remove" onclick="deleteTxn('${escHtml(t.id)}')" title="Remove transaction">✕</button>
      </td>
    </tr>`;
  }).join('');
}

/* ─── Flow chart view filter ─────────────────────────────────── */
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
  renderBreakdownChart();
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
    {
      id:              'in',
      label:           'Cash In',
      data:            months.map(m => sumType('in', m.key)),
      backgroundColor: 'rgba(52,211,153,0.65)',
      borderColor:     '#34d399',
      borderWidth:     1,
      borderRadius:    4,
      stack:           'inflow',
    },
    {
      id:              'out',
      label:           'Cash Out',
      data:            months.map(m => sumType('out', m.key)),
      backgroundColor: 'rgba(248,113,113,0.65)',
      borderColor:     '#f87171',
      borderWidth:     1,
      borderRadius:    0,
      stack:           'outflow',
    },
    {
      id:              'invested',
      label:           'Invested',
      data:            months.map(m => sumType('invested', m.key)),
      backgroundColor: 'rgba(99,102,241,0.65)',
      borderColor:     '#6366f1',
      borderWidth:     1,
      borderRadius:    4,
      stack:           'outflow',
    },
  ];

  const datasets = flowView ? allDatasets.filter(d => d.id === flowView) : allDatasets;

  const ctx = document.getElementById('chart-flow').getContext('2d');
  if (chartFlow) chartFlow.destroy();

  chartFlow = new Chart(ctx, {
    type: 'bar',
    data: { labels: months.map(m => m.label), datasets },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color:          '#8892a4',
            font:           { family: "'DM Mono'", size: 11 },
            usePointStyle:  true,
            pointStyle:     'circle',
            boxWidth:       8,
            boxHeight:      8,
            padding:        16,
          },
        },
        tooltip: {
          backgroundColor: '#111525',
          borderColor:     '#1e2640',
          borderWidth:     1,
          titleColor:      '#eef0ff',
          bodyColor:       '#8892a4',
          titleFont:       { family: "'DM Sans'", size: 13 },
          bodyFont:        { family: "'DM Mono'", size: 11 },
          callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmtMXN(ctx.parsed.y)}` },
        },
      },
      scales: {
        x: {
          stacked: true,
          grid:    { color: 'rgba(255,255,255,0.04)' },
          ticks:   { color: '#8892a4', font: { family: "'DM Mono'", size: 11 } },
        },
        y: {
          stacked: true,
          grid:    { color: 'rgba(255,255,255,0.04)' },
          border:  { dash: [3, 3] },
          ticks: {
            color:    '#8892a4',
            font:     { family: "'DM Mono'", size: 10 },
            callback: v => v === 0 ? '0' : fmtMXN(v),
          },
        },
      },
    },
  });
}

function renderBreakdownChart() {
  const sumType = type => transactions
    .filter(t => t.type === type)
    .reduce((s, t) => s + (t.amountMXN || 0), 0);

  const totalIn       = sumType('in');
  const totalOut      = sumType('out');
  const totalInvested = sumType('invested');
  const total         = totalIn + totalOut + totalInvested;

  if (total === 0) {
    const ctx = document.getElementById('chart-breakdown').getContext('2d');
    if (chartBreakdown) chartBreakdown.destroy();
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    chartBreakdown = null;
    return;
  }

  const labels = ['Cash In', 'Cash Out', 'Invested'];
  const data   = [totalIn, totalOut, totalInvested];
  const colors = ['#34d399', '#f87171', '#6366f1'];

  const ctx = document.getElementById('chart-breakdown').getContext('2d');
  if (chartBreakdown) chartBreakdown.destroy();

  chartBreakdown = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors.map(c => c + 'b3'),
        borderColor:      colors,
        hoverBorderColor: colors,
        borderWidth:      1,
        hoverOffset:      6,
      }],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      cutout:              '66%',
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color:         '#8892a4',
            font:          { family: "'DM Mono'", size: 11 },
            padding:       14,
            usePointStyle: true,
            pointStyle:    'circle',
            boxWidth:      8,
            boxHeight:     8,
          },
        },
        tooltip: {
          backgroundColor: '#111525',
          borderColor:     '#1e2640',
          borderWidth:     1,
          titleColor:      '#eef0ff',
          bodyColor:       '#8892a4',
          titleFont:       { family: "'DM Sans'", size: 13 },
          bodyFont:        { family: "'DM Mono'", size: 11 },
          callbacks: {
            label: ctx => ` ${fmtMXN(ctx.parsed)} (${((ctx.parsed / total) * 100).toFixed(1)}%)`,
          },
        },
      },
    },
  });
}

/* ─── Export ─────────────────────────────────────────────────── */
document.getElementById('export-btn').addEventListener('click', () => {
  if (transactions.length === 0) { toast('No transactions to export.', 'warning'); return; }
  const header = ['Date', 'Description', 'Account', 'Type', 'Amount (local)', 'Currency', 'Amount (MXN)'];
  const rows   = transactions.map(t =>
    [
      t.date        || '',
      t.description || '',
      t.accountName || '',
      t.type,
      t.amount,
      t.currency    || 'MXN',
      (t.amountMXN  || 0).toFixed(2),
    ]
    .map(v => `"${String(v).replace(/"/g, '""')}"`)
    .join(',')
  );
  const csv  = [header.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `wealthos-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Exported to CSV.', 'success');
});

/* ─── Formatting helpers ─────────────────────────────────────── */
function fmtMXN(n) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: 'MXN', minimumFractionDigits: 2,
  }).format(n || 0);
}

function fmtLocal(n, currency) {
  try {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(n || 0);
  } catch {
    return `${currency} ${(n || 0).toLocaleString('es-MX', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    })}`;
  }
}

function escHtml(s) {
  return String(s)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}

/* ─── Toast ──────────────────────────────────────────────────── */
function toast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const el        = document.createElement('div');
  el.className    = `toast toast--${type}`;
  el.textContent  = msg;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('toast--visible'));
  setTimeout(() => {
    el.classList.remove('toast--visible');
    setTimeout(() => el.remove(), 350);
  }, 3000);
}
