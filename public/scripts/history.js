// ─── Init ─────────────────────────────────────────────────────────────────────
document.getElementById('current-date').textContent =
  new Date().toLocaleDateString(window.WOS_LOCALE || 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

let activeFilter = 'All';
let searchText   = '';
let dateRange    = 'all';

// ─── In-memory events (populated from API on load) ────────────────────────────
let allEvents = [];

function getEvents() {
  return allEvents;
}

// ─── Filter logic ──────────────────────────────────────────────────────────────
function applyFilters(events) {
  const now = new Date();

  return events.filter(e => {
    // Category filter
    if (activeFilter !== 'All' && e.category !== activeFilter) return false;

    // Search
    if (searchText) {
      const hay = (e.title + ' ' + e.detail).toLowerCase();
      if (!hay.includes(searchText.toLowerCase())) return false;
    }

    // Date range
    if (dateRange !== 'all') {
      const d = new Date(e.timestamp);
      if (dateRange === 'today') {
        if (d.toDateString() !== now.toDateString()) return false;
      } else if (dateRange === 'week') {
        const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
        if (d < weekAgo) return false;
      } else if (dateRange === 'month') {
        if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) return false;
      } else if (dateRange === 'year') {
        if (d.getFullYear() !== now.getFullYear()) return false;
      }
    }

    return true;
  });
}

// ─── Render ───────────────────────────────────────────────────────────────────
function render() {
  const all      = getEvents();
  const filtered = applyFilters(all);

  updateStats(all);
  renderTimeline(filtered);
  const isES = window.WOS_LANG === 'es';
  document.getElementById('result-count').textContent = isES
    ? filtered.length + ' ' + (filtered.length !== 1 ? 'eventos' : 'evento')
    : filtered.length + ' event' + (filtered.length !== 1 ? 's' : '');
}

function updateStats(events) {
  const now = new Date();
  const thisMonth = events.filter(e => {
    const d = new Date(e.timestamp);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  const txnEvents = events.filter(e => e.category === 'Transaction');
  const cashIn  = txnEvents.filter(e => e.type === 'transaction_in')
    .reduce((s, e) => s + Math.abs(parseFloat(e.amount) || 0), 0);
  const cashOut = txnEvents.filter(e => e.type === 'transaction_out')
    .reduce((s, e) => s + Math.abs(parseFloat(e.amount) || 0), 0);

  const fmt2 = n => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  document.getElementById('stat-total').textContent        = events.length;
  document.getElementById('stat-month').textContent        = thisMonth.length;
  document.getElementById('stat-investments').textContent  = events.filter(e => e.category === 'Investment').length;
  document.getElementById('stat-transactions').textContent = txnEvents.length;
  document.getElementById('stat-txn-flow').textContent     = txnEvents.length
    ? `+$${fmt2(cashIn)} in · −$${fmt2(cashOut)} out`
    : 'cash in & out';
}

function renderTimeline(events) {
  const container = document.getElementById('timeline-container');

  if (!events.length) {
    container.innerHTML = `
      <div class="history-empty">
        <div class="history-empty__icon">○</div>
        <div class="history-empty__text">${(typeof t === 'function' ? t('history_empty_text') : 'No events found')}</div>
        <div class="history-empty__sub">${(typeof t === 'function' ? t('history_empty_sub') : 'Actions you take — adding investments, managing accounts, recording transactions — will appear here.')}</div>
      </div>`;
    return;
  }

  // Group by calendar date
  const groups = {};
  events.forEach(e => {
    const d = new Date(e.timestamp);
    const key = d.toLocaleDateString(window.WOS_LOCALE || 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  });

  let html = '';
  for (const [dateLabel, entries] of Object.entries(groups)) {
    html += `<div class="timeline-date-group">
      <div class="timeline-date-label">${escHtml(dateLabel)}</div>`;

    entries.forEach(e => {
      const amountHtml = formatAmount(e);
      const timeStr    = new Date(e.timestamp).toLocaleTimeString(window.WOS_LOCALE || 'en-US', { hour: '2-digit', minute: '2-digit' });
      const iconClass  = `entry__icon--${e.category || 'default'}`;
      const badgeClass = `entry__badge--${e.category || 'default'}`;

      html += `
      <div class="timeline-entry">
        <div class="entry__icon ${iconClass}">${escHtml(e.icon || '•')}</div>
        <div class="entry__body">
          <div class="entry__title">${escHtml(e.title)}</div>
          <div class="entry__detail">${escHtml(e.detail)}</div>
        </div>
        <div class="entry__right">
          ${amountHtml}
          <span class="entry__time">${timeStr}</span>
          <span class="entry__badge ${badgeClass}">${escHtml(e.category || '')}</span>
        </div>
      </div>`;
    });

    html += `</div>`;
  }

  container.innerHTML = html;
}

function formatAmount(e) {
  if (e.amount === null || e.amount === undefined) return '';
  const n = parseFloat(e.amount);
  if (isNaN(n)) return '';

  // Transactions: show +/- with colour
  if (e.type === 'transaction_in') {
    return `<span class="entry__amount entry__amount--positive">+$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`;
  }
  if (e.type === 'transaction_out') {
    return `<span class="entry__amount entry__amount--negative">−$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`;
  }
  if (e.type === 'investment_removed' || e.type === 'account_removed') {
    return `<span class="entry__amount entry__amount--neutral">$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`;
  }
  // Added / updated
  return `<span class="entry__amount entry__amount--positive">$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ─── Controls ─────────────────────────────────────────────────────────────────
function setFilter(filter, btn) {
  activeFilter = filter;
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('filter-tab--active'));
  btn.classList.add('filter-tab--active');
  render();
}

function onSearch(val) {
  searchText = val;
  render();
}

function onDateFilter(val) {
  dateRange = val;
  render();
}

// ─── Export CSV ───────────────────────────────────────────────────────────────
document.getElementById('export-btn').addEventListener('click', () => {
  const events = applyFilters(getEvents());
  if (!events.length) { toast(typeof t === 'function' ? t('toast_no_export_events') : 'No events to export.', 'warning'); return; }

  const rows = [['Timestamp','Category','Type','Title','Detail','Amount']];
  events.forEach(e => {
    rows.push([
      e.timestamp, e.category, e.type,
      '"' + (e.title  || '').replace(/"/g,'""') + '"',
      '"' + (e.detail || '').replace(/"/g,'""') + '"',
      e.amount !== null ? e.amount : '',
    ]);
  });

  const csv  = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'wealthos-history.csv';
  a.click();
  URL.revokeObjectURL(url);
});

// ─── Toast ────────────────────────────────────────────────────────────────────
function toast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = 'toast' + (type === 'error' ? ' toast--error' : type === 'warning' ? ' toast--warn' : '');
  t.textContent = msg;
  document.getElementById('toast-container').appendChild(t);
  setTimeout(() => t.classList.add('toast--visible'), 10);
  setTimeout(() => { t.classList.remove('toast--visible'); setTimeout(() => t.remove(), 300); }, 3000);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
(async function init() {
  try {
    allEvents = await WOS_API.history.list({ limit: 500 });
  } catch (_) {
    allEvents = [];
  }
  render();
})();

