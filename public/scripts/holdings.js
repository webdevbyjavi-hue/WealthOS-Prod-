// ─── Date ────────────────────────────────────────────────────────────────────
document.getElementById('current-date').textContent =
  new Date().toLocaleDateString(window.WOS_LOCALE || 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

// ─── Tab Switching ────────────────────────────────────────────────────────────
function switchTab(name, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('cat-tab--active'));
  document.getElementById('tab-' + name).classList.remove('hidden');
  btn.classList.add('cat-tab--active');
  if (name === 'stocks') updateCharts();
  if (name === 'bonos')  { if (!bonosLineChart)  initBonosCharts();  else updateBonosCharts(); }
  if (name === 'fondos') { if (!fondosLineChart) initFondosCharts(); else updateFondosCharts(); }
  if (name === 'fibras') { if (!fibrasLineChart) initFibrasCharts(); else updateFibrasCharts(); }
  if (name === 'retiro') { if (!retiroLineChart) initRetiroCharts(); else updateRetiroCharts(); }
  if (name === 'crypto') { if (!cryptoLineChart) initCryptoCharts(); else updateCryptoCharts(); }
  if (name === 'bienes') { if (!bienesLineChart) initBienesCharts(); else updateBienesCharts(); }
}

// ─── Add Position (topbar button) ────────────────────────────────────────────
function openAddModal() {
  const activeTab = (document.querySelector('.cat-tab--active') || {}).dataset?.tab || 'stocks';
  const dispatch = {
    stocks: openStockModal,
    bonos:  openBonoModal,
    fondos: openFondoModal,
    fibras: openFibraModal,
    retiro: openRetiroModal,
    crypto: openCryptoModal,
    bienes: openBienesModal,
  };
  const fn = dispatch[activeTab];
  if (fn) fn();
}

// ─── Export ───────────────────────────────────────────────────────────────────
document.getElementById('export-btn').addEventListener('click', () => {
  alert(typeof t === 'function' ? t('export_coming_soon') : 'Export — coming soon.');
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(n) {
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
}
function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.getElementById('toast-container').appendChild(t);
  setTimeout(() => t.classList.add('toast--visible'), 10);
  setTimeout(() => { t.classList.remove('toast--visible'); setTimeout(() => t.remove(), 300); }, 3000);
}

// ─── Confirm-delete modal ─────────────────────────────────────────────────────
(function () {
  const overlay  = document.getElementById('confirm-delete-overlay');
  const cancelBtn = document.getElementById('confirm-cancel-btn');
  const deleteBtn = document.getElementById('confirm-delete-btn');
  const msgEl    = document.getElementById('confirm-modal-message');
  const titleEl  = document.getElementById('confirm-modal-title');
  let _resolve;

  function openConfirm(message, title) {
    msgEl.textContent   = message || '¿Estás seguro? Esta acción no se puede deshacer.';
    titleEl.textContent = title   || 'Eliminar posición';
    overlay.classList.add('modal-overlay--visible');
    return new Promise(resolve => { _resolve = resolve; });
  }

  function close(result) {
    overlay.classList.remove('modal-overlay--visible');
    if (_resolve) { _resolve(result); _resolve = null; }
  }

  cancelBtn.addEventListener('click', () => close(false));
  deleteBtn.addEventListener('click', () => close(true));
  overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });

  window.confirmDelete = openConfirm;
})();

// ─── Stock ticker lookup ───────────────────────────────────────────────────────
let _stockLookupInProgress = false;

async function lookupStockTicker() {
  if (_stockLookupInProgress) return;

  const ticker = document.getElementById('si-ticker').value.trim().toUpperCase();
  const date   = document.getElementById('si-fecha').value; // YYYY-MM-DD from datepicker

  if (!ticker) { showToast('Enter a ticker symbol first.'); return; }
  if (!date)   { showToast('Select a purchase date first.'); return; }

  _stockLookupInProgress = true;
  const btn = document.getElementById('si-lookup-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Looking up…'; }

  try {
    // Fetch quote + historical price in one call; FX rate in parallel
    const [info, fx] = await Promise.all([
      WOS_API.lookup.ticker(ticker, date),
      WOS_API.exchangeRate.getUsdMxn().catch(() => null),
    ]);

    document.getElementById('si-ticker').value = info.ticker;
    document.getElementById('si-name').value   = info.name;

    // Current price → MXN for the si-price field
    const priceEl = document.getElementById('si-price');
    if (fx) {
      const mxnPrice = info.price * fx.rate;
      priceEl.dataset.usd = info.price;
      priceEl.value       = mxnPrice.toFixed(2);
      showToast(`${info.name} · Today: $${mxnPrice.toFixed(2)} MXN`);
    } else {
      priceEl.dataset.usd = info.price;
      priceEl.value       = info.price.toFixed(2);
      showToast(`${info.name} · Today: $${info.price.toFixed(2)} USD`);
    }
  } catch (err) {
    showToast(err.message || 'Lookup failed. Check the ticker and try again.');
  } finally {
    _stockLookupInProgress = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Refresh Prices'; }
  }
}

async function lookupFibraTicker() {
  const ticker = document.getElementById('fbi-ticker').value.trim().toUpperCase();
  if (!ticker) { showToast('Ingresa un ticker primero.'); return; }

  const btn = document.getElementById('fbi-lookup-btn');
  btn.disabled = true;
  btn.textContent = 'Buscando…';

  try {
    const info = await WOS_API.lookup.fibra(ticker);
    document.getElementById('fbi-ticker').value = info.ticker;
    document.getElementById('fbi-nombre').value = info.name;
    document.getElementById('fbi-actual').value = info.price.toFixed(4);
    showToast(`Cargado: ${info.name} @ $${info.price.toFixed(4)} MXN`);
  } catch (err) {
    showToast(err.message || 'Lookup fallido. Verifica el ticker e intenta de nuevo.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Lookup';
  }
}

async function lookupCryptoSymbol() {
  const symbol = document.getElementById('ci-symbol').value.trim().toUpperCase();
  if (!symbol) { showToast('Enter a symbol first.'); return; }

  const btn = document.getElementById('ci-lookup-btn');
  btn.disabled = true;
  btn.textContent = 'Looking up…';

  try {
    const info = await WOS_API.lookup.crypto(symbol);
    document.getElementById('ci-symbol').value = info.symbol;
    document.getElementById('ci-name').value   = info.name;
    document.getElementById('ci-price').value  = info.price.toFixed(2);
    showToast(`Loaded: ${info.name} @ $${info.price.toFixed(2)} USD`);
  } catch (err) {
    showToast(err.message || 'Lookup failed. Check the symbol and try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Lookup';
  }
}

// ══════════════════════════════════════════════════════════════
//  STOCKS DASHBOARD
// ══════════════════════════════════════════════════════════════

// ─── Constants ────────────────────────────────────────────────────────────────
const STOCK_COLORS = [
  '#6366f1','#34d399','#fbbf24','#f87171',
  '#8b5cf6','#06b6d4','#ec4899','#a3e635'
];

const SAMPLE_STOCKS = [
  { id: 1, ticker: 'AAPL',  name: 'Apple Inc.',      shares: 15,  avgCost: 145.20, currentPrice: 189.50, fechaCompra: '2023-03-15' },
  { id: 2, ticker: 'MSFT',  name: 'Microsoft Corp.', shares: 10,  avgCost: 280.00, currentPrice: 415.80, fechaCompra: '2022-11-08' },
  { id: 3, ticker: 'NVDA',  name: 'NVIDIA Corp.',    shares: 5,   avgCost: 220.00, currentPrice: 875.40, fechaCompra: '2023-06-20' },
  { id: 4, ticker: 'GOOGL', name: 'Alphabet Inc.',   shares: 8,   avgCost: 125.50, currentPrice: 172.30, fechaCompra: '2023-01-10' },
  { id: 5, ticker: 'JPM',   name: 'JPMorgan Chase',  shares: 20,  avgCost: 138.00, currentPrice: 197.80, fechaCompra: '2022-08-22' },
  { id: 6, ticker: 'TSLA',  name: 'Tesla Inc.',      shares: 12,  avgCost: 220.00, currentPrice: 175.20, fechaCompra: '2024-02-05' },
];

// ─── State ────────────────────────────────────────────────────────────────────
let stocks = [];
let lineRangeDays = 7;
let lineChart, donutChart, barChart;
let editingStockId = null;
let sortCol = null, sortDir = 1; // 1 = asc, -1 = desc

// Real portfolio history — populated by loadRealHistory() after initHoldings().
// Each is a Map<'YYYY-MM-DD', number> or null when no snapshot data exists yet.
let _stocksHistory = null;
let _cryptoHistory = null;
let _fibrasHistory = null;

// Fake history cache keyed by category — 365 pts generated once per session.
const _fakeCache = {};
function _genFake(key, total) {
  if (!total) return null;
  if (!_fakeCache[key]) {
    const pts = [];
    let p = total * (0.72 + Math.random() * 0.35);
    for (let i = 0; i < 364; i++) {
      p = Math.max(p * (1 + (Math.random() - 0.48) * 0.018), 0.01);
      pts.push(parseFloat(p.toFixed(2)));
    }
    pts.push(parseFloat(total.toFixed(2)));
    _fakeCache[key] = pts;
  }
  return _fakeCache[key];
}

// Returns number of calendar days since the earliest purchase date in the array.
// Returns null when no holding has a purchase date set.
function _daysSincePurchase(holdings, dateField) {
  const dates = holdings.filter(h => h[dateField]).map(h => new Date(h[dateField] + 'T12:00:00Z'));
  if (!dates.length) return null;
  const earliest = new Date(Math.min(...dates));
  return Math.max(1, Math.ceil((Date.now() - earliest.getTime()) / 86400000));
}

function sortBy(col) {
  sortDir = (sortCol === col) ? -sortDir : 1;
  sortCol = col;
  renderTable(document.querySelector('#table-stocks').closest('.holdings-panel').querySelector('.search-input').value || '');
}

function getSortValue(h, col) {
  switch (col) {
    case 'ticker':        return h.ticker;
    case 'name':          return h.name;
    case 'shares':        return h.shares;
    case 'avgCost':       return h.avgCost;
    case 'currentPrice':  return h.currentPrice;
    case 'value':         return h.currentPrice * h.shares;
    case 'gain':          return (h.currentPrice - h.avgCost) * h.shares;
    case 'return':        return h.avgCost ? (h.currentPrice - h.avgCost) / h.avgCost : 0;
    default:              return 0;
  }
}

// Stocks loaded from API in initHoldings() below

// ─── History generator ────────────────────────────────────────────────────────
function generateHistory(price, days = 91) {
  const pts = [];
  let p = price * (0.72 + Math.random() * 0.35);
  for (let i = 0; i < days - 1; i++) {
    p = Math.max(p * (1 + (Math.random() - 0.48) * 0.022), 0.01);
    pts.push(parseFloat(p.toFixed(2)));
  }
  pts.push(price);
  return pts;
}

function saveStocks() { /* no-op — data goes directly to API */ }

// ─── Stocks KPI Rendering (stocks tab only) ──────────────────────────────────
function renderKPIs() {
  const totalValue    = stocks.reduce((s, h) => s + h.currentPrice * h.shares, 0);
  const totalInvested = stocks.reduce((s, h) => s + h.avgCost * h.shares, 0);
  const gain          = totalValue - totalInvested;
  const gainPct       = totalInvested ? (gain / totalInvested) * 100 : 0;
  const pts         = getPortfolioHistory(lineRangeDays);
  const dailyChange = pts.length >= 2 ? pts[pts.length - 1] - pts[0] : 0;

  document.getElementById('s-total-value').textContent  = fmt(totalValue);
  document.getElementById('s-total-change').textContent = fmtPct(gainPct);
  document.getElementById('s-total-change').className   =
    'kpi__change ' + (gainPct >= 0 ? 'kpi__change--up' : 'kpi__change--down');

  document.getElementById('s-invested').textContent = fmt(totalInvested);

  const gainEl = document.getElementById('s-gain');
  gainEl.textContent = (gain >= 0 ? '+' : '') + fmt(gain);
  gainEl.className   = 'kpi__value kpi__value--sm ' + (gain >= 0 ? 'kpi__change--up' : 'kpi__change--down');
  document.getElementById('s-gain-pct').textContent = fmtPct(gainPct);

  const dailyEl    = document.getElementById('s-daily');
  const dailySubEl = document.getElementById('s-daily-sub');
  dailyEl.textContent = (dailyChange >= 0 ? '+' : '') + fmt(dailyChange);
  dailyEl.className   = 'kpi__value kpi__value--sm ' + (dailyChange >= 0 ? 'kpi__change--up' : 'kpi__change--down');
  if (dailySubEl) dailySubEl.textContent = _rangeSubLabel(lineRangeDays);

  renderSummaryStrip();
}

// ─── Summary Strip (aggregates all categories) ───────────────────────────────
function renderSummaryStrip() {
  const stocksValue    = stocks.reduce((s, h) => s + h.currentPrice * h.shares, 0);
  const stocksInvested = stocks.reduce((s, h) => s + h.avgCost      * h.shares, 0);
  const bonosValue     = bonos.reduce((s, b)  => s + b.monto, 0);
  const bonosInvested  = bonos.reduce((s, b)  => s + b.monto, 0);
  const fondosValue    = fondos.reduce((s, f) => s + f.navActual * f.unidades, 0);
  const fondosInvested = fondos.reduce((s, f) => s + f.precioCompra * f.unidades, 0);
  const fibrasValue    = fibras.reduce((s, f) => s + f.precioActual * f.certificados, 0);
  const fibrasInvested = fibras.reduce((s, f) => s + f.precioCompra * f.certificados, 0);
  const retiroValue    = retiro.reduce((s, r) => s + r.saldo, 0);
  const retiroInvested = retiro.reduce((s, r) => s + r.saldo - (r.aportacionYTD || 0), 0);
  const cryptoValue    = cryptos.reduce((s, c) => s + c.currentPrice * c.amount, 0);
  const cryptoInvested = cryptos.reduce((s, c) => s + c.avgCost * c.amount, 0);
  const bienesValue    = bienes.reduce((s, b) => s + computeValorActual(b), 0);
  const bienesInvested = bienes.reduce((s, b) => s + costoTotal(b), 0);

  const totalValue    = stocksValue + bonosValue + fondosValue + fibrasValue + retiroValue + cryptoValue + bienesValue;
  const totalInvested = stocksInvested + bonosInvested + fondosInvested + fibrasInvested + retiroInvested + cryptoInvested + bienesInvested;
  const gain          = totalValue - totalInvested;

  const liquidValue = bonosValue + fondosValue;

  document.getElementById('sum-total').textContent      = fmt(totalValue);
  document.getElementById('sum-invested').textContent   = fmt(totalInvested);
  document.getElementById('sum-categories').textContent = fmt(liquidValue);
  const pnlEl = document.getElementById('sum-pnl');
  pnlEl.textContent = (gain >= 0 ? '+' : '') + fmt(gain);
  pnlEl.style.color = gain >= 0 ? 'var(--up)' : 'var(--down)';
}

// ─── Table Rendering ──────────────────────────────────────────────────────────
function renderTable(filter = '') {
  const tbody = document.getElementById('body-stocks');
  const f     = filter.toLowerCase();
  tbody.innerHTML = '';

  const totalValue = stocks.reduce((s, h) => s + h.currentPrice * h.shares, 0);
  let filtered = stocks.filter(h =>
    h.ticker.toLowerCase().includes(f) || h.name.toLowerCase().includes(f)
  );

  if (sortCol) {
    filtered.sort((a, b) => {
      const va = getSortValue(a, sortCol);
      const vb = getSortValue(b, sortCol);
      return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * sortDir;
    });
  }

  // Update sort header indicators
  document.querySelectorAll('.th-sort').forEach(th => {
    const icon = th.querySelector('.sort-icon');
    if (th.dataset.col === sortCol) {
      icon.textContent = sortDir === 1 ? '↑' : '↓';
      th.classList.add('th-sort--active');
    } else {
      icon.textContent = '↕';
      th.classList.remove('th-sort--active');
    }
  });

  const isES = window.WOS_LANG === 'es';
  document.getElementById('stocks-count').textContent = isES
    ? `${stocks.length} ${stocks.length !== 1 ? 'posiciones' : 'posición'}`
    : `${stocks.length} position${stocks.length !== 1 ? 's' : ''}`;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="table__empty">${typeof t === 'function' ? t('empty_no_stocks') : 'No stock positions yet — add your first.'}</td></tr>`;
    return;
  }

  filtered.forEach(h => {
    const mv   = h.currentPrice * h.shares;
    const gain = (h.currentPrice - h.avgCost) * h.shares;
    const ret  = h.avgCost ? ((h.currentPrice - h.avgCost) / h.avgCost) * 100 : 0;
    const up   = gain >= 0;

    const tr = document.createElement('tr');
    tr.className = 'table-row';
    tr.innerHTML = `
      <td><span class="s-indicator s-indicator--${up ? 'up' : 'down'}"></span></td>
      <td class="td--ticker">${h.ticker}</td>
      <td class="s-td-company">${h.name}</td>
      <td>${parseFloat(h.shares.toFixed(4))}</td>
      <td>${fmt(h.avgCost)}</td>
      <td class="td--price">${fmt(h.currentPrice)}</td>
      <td>${fmt(mv)}</td>
      <td class="${up ? 'td--up' : 'td--down'}">${(up ? '+' : '') + fmt(gain)}</td>
      <td class="${up ? 'td--up' : 'td--down'}">${fmtPct(ret)}</td>
      <td>
        <div class="s-row-actions">
          <button class="s-btn-edit" onclick="openStockModal('${h.id}')" title="Edit">✎</button>
          <button class="btn-remove" onclick="removeStock('${h.id}')" title="Remove">✕</button>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });
}

function filterStocksTable(v) { renderTable(v); }

// ─── Charts ───────────────────────────────────────────────────────────────────
function _rangeSubLabel(days) {
  if (days <= 7)   return 'vs. 1W ago';
  if (days <= 30)  return 'vs. 1M ago';
  if (days <= 90)  return 'vs. 3M ago';
  return 'vs. 1Y ago';
}

function getPortfolioHistory(n) {
  const series = _sliceHistory(_stocksHistory, n);
  if (series) return series.map(([, v]) => v);
  const total = stocks.reduce((s, h) => s + h.currentPrice * h.shares, 0);
  const days  = _daysSincePurchase(stocks, 'fechaCompra');
  const clamp = days ? Math.min(n, days) : n;
  const fake  = _genFake('stocks', total);
  return fake ? fake.slice(-clamp) : Array(clamp).fill(0);
}

function getDateLabels(n) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (n - 1 - i));
    return d.toLocaleDateString(window.WOS_LOCALE || 'en-US', { month: 'short', day: 'numeric' });
  });
}

// ─── Real history utilities ───────────────────────────────────────────────────

/**
 * Slice the last `n` [date, value] entries from a Map, sorted ascending by date.
 * Returns null when the map is absent or empty.
 */
function _sliceHistory(histMap, n) {
  if (!histMap || histMap.size === 0) return null;
  return [...histMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-n);
}

/**
 * Return chart date labels from a real history map when available,
 * falling back to synthetic labels generated from today.
 * Pass fallbackDays to clamp the fallback range to days since purchase.
 */
function getRealDateLabels(histMap, n, fallbackDays) {
  const series = _sliceHistory(histMap, n);
  if (series) {
    return series.map(([date]) => {
      const d = new Date(date + 'T12:00:00Z');
      return d.toLocaleDateString(window.WOS_LOCALE || 'en-US', { month: 'short', day: 'numeric' });
    });
  }
  const clamp = fallbackDays ? Math.min(n, fallbackDays) : n;
  return getDateLabels(clamp);
}

/**
 * Fetch 90 days of historical OHLCV data for stocks, crypto, and fibras
 * from /api/assets/:id/history and aggregate into per-category date→value Maps.
 *
 * Silently falls back to null (fake data) for any category where:
 *   • The holding has no matching assets entry (backfill not yet triggered)
 *   • No snapshots exist yet for the asset
 *   • The API call fails for any reason
 */
function _showChartLoading() {
  ['stocks-chart-loading', 'fibras-chart-loading', 'crypto-chart-loading'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.hidden = false;
  });
}
function _hideChartLoading() {
  ['stocks-chart-loading', 'fibras-chart-loading', 'crypto-chart-loading'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  });
}

async function loadRealHistory() {
  const today = new Date().toISOString().slice(0, 10);
  const from  = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 365);
    return d.toISOString().slice(0, 10);
  })();

  let allAssets;
  try {
    allAssets = await WOS_API.assets.list();
  } catch (err) {
    console.warn('[WOS] loadRealHistory: assets.list() failed:', err.message);
    return; // assets endpoint unavailable — keep fake data
  }

  console.log('[WOS] loadRealHistory: assets in registry:', allAssets.map(a => a.ticker));

  const byTicker = Object.fromEntries(allAssets.map(a => [a.ticker, a]));

  /**
   * Build a date→value Map for a set of holdings.
   * @param {Array}  holdings    — array of holding objects
   * @param {string} tickerKey   — field name for the ticker/symbol
   * @param {string} quantityKey — field name for the quantity
   * @param {Function} fxFn     — (holding) → exchange rate multiplier
   */
  async function buildMap(holdings, tickerKey, quantityKey, fxFn) {
    const map = new Map();
    await Promise.all(holdings.map(async (h) => {
      const asset = byTicker[h[tickerKey]];
      if (!asset) {
        console.log('[WOS] loadRealHistory: no assets entry for', h[tickerKey], '— backfill not yet triggered');
        return;
      }
      try {
        const { history } = await WOS_API.assets.history(asset.id, from, today);
        console.log('[WOS] loadRealHistory:', h[tickerKey], '→', history.length, 'snapshots');
        const fx = fxFn(h);
        history.forEach(p => {
          map.set(p.date, (map.get(p.date) || 0) + p.value * parseFloat(h[quantityKey]) * fx);
        });
      } catch (err) { console.warn('[WOS] loadRealHistory: history fetch failed for', h[tickerKey], err.message); }
    }));
    return map.size > 0 ? map : null;
  }

  // Run all three fetches in parallel
  const [sm, cm, fm] = await Promise.all([
    buildMap(stocks,  'ticker', 'shares',      h => h.tipoDeCambio || 1),
    buildMap(cryptos, 'symbol', 'amount',       () => 1),
    buildMap(fibras,  'ticker', 'certificados', () => 1),
  ]);

  _stocksHistory = sm;
  _cryptoHistory = cm;
  _fibrasHistory = fm;
}

Chart.defaults.color         = '#8892a4';
Chart.defaults.borderColor   = '#1e2640';
Chart.defaults.font.family   = "'DM Sans', system-ui, sans-serif";
Chart.defaults.font.size     = 11;

function initCharts() {
  const hasRealData = _stocksHistory && _stocksHistory.size > 0;
  const pts   = hasRealData ? getPortfolioHistory(lineRangeDays) : [];
  const dates = hasRealData ? getRealDateLabels(_stocksHistory, lineRangeDays, _daysSincePurchase(stocks, 'fechaCompra')) : [];
  const lineUp = pts.length > 0 && pts[pts.length - 1] >= pts[0];
  const lc     = lineUp ? '#6366f1' : '#f87171';

  // ── Line chart ──────────────────────────────────────────────
  lineChart = new Chart(document.getElementById('chart-line'), {
    type: 'line',
    data: {
      labels: dates,
      datasets: [{
        data: pts,
        borderColor: lc,
        borderWidth: 2,
        fill: true,
        backgroundColor(ctx) {
          const { chart } = ctx;
          const { ctx: c, chartArea } = chart;
          if (!chartArea) return 'transparent';
          const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          g.addColorStop(0, lineUp ? 'rgba(99,102,241,0.22)' : 'rgba(248,113,113,0.22)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          return g;
        },
        tension: 0.45,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: lc,
        pointHoverBorderColor: '#111525',
        pointHoverBorderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#111525',
          borderColor: '#1e2640',
          borderWidth: 1,
          titleColor: '#8892a4',
          bodyColor: '#eef0ff',
          padding: 10,
          callbacks: { label: ctx => '  ' + fmt(ctx.raw) }
        }
      },
      scales: {
        x: {
          grid: { color: '#1e2640', tickLength: 0 },
          ticks: { maxTicksLimit: 7, color: '#3d4a63', padding: 6 },
          border: { color: '#1e2640' }
        },
        y: {
          position: 'right',
          grid: { color: '#1a2138', tickLength: 0 },
          ticks: {
            color: '#3d4a63',
            padding: 8,
            callback: v => '$' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v.toFixed(0))
          },
          border: { color: 'transparent' }
        }
      }
    }
  });

  // ── Donut chart ─────────────────────────────────────────────
  donutChart = new Chart(document.getElementById('chart-donut'), {
    type: 'doughnut',
    data: {
      labels: stocks.map(h => h.ticker),
      datasets: [{
        data: stocks.map(h => parseFloat((h.currentPrice * h.shares).toFixed(2))),
        backgroundColor: STOCK_COLORS.slice(0, stocks.length),
        borderColor: '#111525',
        borderWidth: 3,
        hoverOffset: 10,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: '#8892a4',
            boxWidth: 9,
            boxHeight: 9,
            borderRadius: 99,
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 14,
            font: { size: 11 }
          }
        },
        tooltip: {
          backgroundColor: '#111525',
          borderColor: '#1e2640',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label(ctx) {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct   = ((ctx.raw / total) * 100).toFixed(1);
              return `  ${ctx.label}:  ${fmt(ctx.raw)}  (${pct}%)`;
            }
          }
        }
      }
    }
  });

  // ── Bar chart ───────────────────────────────────────────────
  const stocksByDate = [...stocks].sort((a, b) => {
    if (!a.fechaCompra && !b.fechaCompra) return 0;
    if (!a.fechaCompra) return 1;
    if (!b.fechaCompra) return -1;
    return a.fechaCompra.localeCompare(b.fechaCompra);
  });
  const barData    = stocksByDate.map(h => parseFloat(((h.currentPrice - h.avgCost) * h.shares).toFixed(2)));
  const barColors  = barData.map(v => v >= 0 ? 'rgba(52,211,153,0.75)' : 'rgba(248,113,113,0.75)');
  const barBorders = barData.map(v => v >= 0 ? '#34d399' : '#f87171');

  barChart = new Chart(document.getElementById('chart-bar'), {
    type: 'bar',
    data: {
      labels: stocksByDate.map(h => h.ticker),
      datasets: [{
        label: 'Gain / Loss',
        data: barData,
        backgroundColor: barColors,
        borderColor: barBorders,
        borderWidth: 1,
        borderRadius: 5,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#111525',
          borderColor: '#1e2640',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label(ctx) {
              const v = ctx.raw;
              return '  ' + (v >= 0 ? '+' : '') + fmt(v);
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#8892a4', padding: 4 },
          border: { color: '#1e2640' }
        },
        y: {
          grid: { color: '#1a2138', tickLength: 0 },
          ticks: {
            color: '#3d4a63',
            padding: 8,
            callback: v => (v >= 0 ? '' : '') + '$' + (Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(0))
          },
          border: { color: 'transparent' }
        }
      }
    }
  });
}

function updateCharts() {
  if (!lineChart) return;

  const hasRealData = _stocksHistory && _stocksHistory.size > 0;
  const pts    = hasRealData ? getPortfolioHistory(lineRangeDays) : [];
  const dates  = hasRealData ? getRealDateLabels(_stocksHistory, lineRangeDays, _daysSincePurchase(stocks, 'fechaCompra')) : [];
  const lineUp = pts.length > 0 && pts[pts.length - 1] >= pts[0];
  const lc     = lineUp ? '#6366f1' : '#f87171';

  lineChart.data.labels                       = dates;
  lineChart.data.datasets[0].data             = pts;
  lineChart.data.datasets[0].borderColor      = lc;
  lineChart.update();

  donutChart.data.labels                            = stocks.map(h => h.ticker);
  donutChart.data.datasets[0].data                  = stocks.map(h => parseFloat((h.currentPrice * h.shares).toFixed(2)));
  donutChart.data.datasets[0].backgroundColor       = STOCK_COLORS.slice(0, stocks.length);
  donutChart.update();

  const stocksByDate = [...stocks].sort((a, b) => {
    if (!a.fechaCompra && !b.fechaCompra) return 0;
    if (!a.fechaCompra) return 1;
    if (!b.fechaCompra) return -1;
    return a.fechaCompra.localeCompare(b.fechaCompra);
  });
  const bd     = stocksByDate.map(h => parseFloat(((h.currentPrice - h.avgCost) * h.shares).toFixed(2)));
  barChart.data.labels                         = stocksByDate.map(h => h.ticker);
  barChart.data.datasets[0].data               = bd;
  barChart.data.datasets[0].backgroundColor    = bd.map(v => v >= 0 ? 'rgba(52,211,153,0.75)' : 'rgba(248,113,113,0.75)');
  barChart.data.datasets[0].borderColor        = bd.map(v => v >= 0 ? '#34d399' : '#f87171');
  barChart.update();
}

function setLineRange(days, btn) {
  lineRangeDays = days;
  document.querySelectorAll('#line-range .tab').forEach(t => t.classList.remove('tab--active'));
  btn.classList.add('tab--active');
  updateCharts();
  renderKPIs();
}

// ─── Add / Edit Modal ─────────────────────────────────────────────────────────
function openStockModal(id = null) {
  editingStockId = id;
  document.getElementById('stock-modal-title').textContent = id ? 'Edit Stock' : 'Add Stock';
  // Add mode: auto-lookup handles it — no button. Edit mode: show "Refresh Prices" button.
  const lookupWrapper = document.getElementById('si-lookup-wrapper');
  if (lookupWrapper) lookupWrapper.style.display = id ? '' : 'none';
  if (id) {
    const s = stocks.find(h => h.id === id);
    if (!s) return;
    const priceEl = document.getElementById('si-price');
    document.getElementById('si-ticker').value = s.ticker;
    document.getElementById('si-name').value   = s.name;
    document.getElementById('si-shares').value = s.shares;
    // si-cost always shows USD (what the user originally paid per share)
    document.getElementById('si-cost').value   = s.avgCostUsd != null ? s.avgCostUsd.toFixed(4) : s.avgCost.toFixed(4);
    // si-price shows MXN; dataset.usd holds the raw USD for the backend payload
    priceEl.dataset.usd = s.currentPriceUsd != null ? s.currentPriceUsd : s.currentPrice;
    priceEl.value       = s.currentPrice != null ? s.currentPrice.toFixed(2) : '';
    document.getElementById('si-fecha').value  = s.fechaCompra || '';
  } else {
    const priceEl = document.getElementById('si-price');
    ['si-ticker','si-name','si-shares','si-cost','si-fecha']
      .forEach(id => { document.getElementById(id).value = ''; });
    priceEl.value       = '';
    delete priceEl.dataset.usd;
  }
  document.getElementById('stock-modal-overlay').classList.add('modal-overlay--visible');
}

function closeStockModal(e) {
  if (!e || e.target === document.getElementById('stock-modal-overlay')) {
    document.getElementById('stock-modal-overlay').classList.remove('modal-overlay--visible');
    editingStockId = null;
  }
}

async function saveStock() {
  const ticker      = document.getElementById('si-ticker').value.trim().toUpperCase();
  const name        = document.getElementById('si-name').value.trim();
  const shares      = parseFloat(document.getElementById('si-shares').value);
  const cost        = parseFloat(document.getElementById('si-cost').value);
  const priceEl     = document.getElementById('si-price');
  // price (USD) is sent to the backend for MXN conversion; priceMxn is for local display
  const price       = parseFloat(priceEl.dataset.usd ?? priceEl.value);
  const priceMxn    = parseFloat(priceEl.value);
  const fechaCompra = document.getElementById('si-fecha').value || null;

  if (!ticker || !name || isNaN(shares) || isNaN(cost) || isNaN(price)) {
    alert('Please fill in all fields.');
    return;
  }

  const editId = editingStockId;
  let apiAction = 'create', targetId = null, backup = null;

  if (editId) {
    const s = stocks.find(h => h.id === editId);
    backup = { ...s };
    if (s) Object.assign(s, { ticker, name, shares, avgCost: cost, currentPrice: priceMxn, fechaCompra });
    apiAction = 'update'; targetId = editId;
  } else {
    const existing = stocks.find(h => h.ticker === ticker);
    if (existing) {
      backup = { ...existing };
      const totalShares = existing.shares + shares;
      // avg_cost is MXN — weighted average stays in MXN.
      existing.avgCost = (existing.shares * existing.avgCost + shares * cost) / totalShares;
      existing.currentPriceUsd = price;
      existing.shares = totalShares; existing.currentPrice = priceMxn; existing.name = name;
      if (fechaCompra && !existing.fechaCompra) existing.fechaCompra = fechaCompra;
      showToast(`Merged with existing ${ticker} position.`);
      apiAction = 'update'; targetId = existing.id;
    } else {
      targetId = Date.now();
      // avg_cost is stored in MXN as entered. currentPriceUsd is the USD value from
      // the Twelve Data lookup so toApi sends it correctly for backend MXN conversion.
      stocks.push({ id: targetId, ticker, name, shares, avgCost: cost, currentPrice: priceMxn, currentPriceUsd: price, fechaCompra, history: generateHistory(priceMxn) });
    }
  }

  logEvent({ type: editId ? 'investment_updated' : 'investment_added', category: 'Investment', icon: '📈', title: `${editId ? 'Updated' : 'Added'} Stock: ${ticker}`, detail: `${shares} shares @ $${cost} avg cost · ${name}`, amount: shares * price });
  renderAll();
  closeStockModal();

  try {
    const item = stocks.find(h => h.id === targetId);
    if (apiAction === 'create' && item) {
      const created = await WOS_API.holdings.create('stocks', item);
      const idx = stocks.findIndex(h => h.id === targetId);
      if (idx !== -1) stocks[idx] = created;
      else item.id = created.id;
      renderAll();

      // If a purchase date was provided, a backfill is running in the background.
      // Poll at 8s, 20s, and 45s to catch it whenever it finishes.
      if (created.fechaCompra) {
        showToast('Fetching price history… chart will update in a few seconds.');
        console.log('[WOS] saveStock: backfill triggered for', created.ticker, 'with date', created.fechaCompra);
        _showChartLoading();
        const delays = [8000, 20000, 45000];
        let retryDone = false;
        delays.forEach((delay, i) => {
          setTimeout(() => {
            loadRealHistory().then(() => {
              if (_stocksHistory && _stocksHistory.size > 0) {
                console.log('[WOS] saveStock: real history loaded after', delay / 1000, 's');
                updateCharts();
                if (!retryDone) { retryDone = true; _hideChartLoading(); }
              }
            }).catch(() => {});
            if (i === delays.length - 1 && !retryDone) { retryDone = true; _hideChartLoading(); }
          }, delay);
        });
      }
    } else if (apiAction === 'update' && item) {
      const updated = await WOS_API.holdings.update('stocks', targetId, item);
      const idx = stocks.findIndex(h => h.id === targetId);
      if (idx !== -1) stocks[idx] = updated;
      renderAll();
    }
  } catch (err) {
    if (apiAction === 'create') { stocks = stocks.filter(h => h.id !== targetId); }
    else if (backup) { const idx = stocks.findIndex(h => h.id === targetId); if (idx !== -1) stocks[idx] = backup; }
    renderAll();
    console.error('[WOS] save error:', err); showToast('Save failed: ' + ((err && (err.message || (err.data && err.data.message))) || 'Unknown error'));
  }
}

async function removeStock(id) {
  if (!await confirmDelete('¿Eliminar esta posición? Esta acción no se puede deshacer.', 'Eliminar Stock')) return;
  const s = stocks.find(h => h.id === id);
  const backup = [...stocks];
  stocks = stocks.filter(h => h.id !== id);
  if (s) logEvent({ type: 'investment_removed', category: 'Investment', icon: '📉', title: `Removed Stock: ${s.ticker}`, detail: `${s.shares} shares · ${s.name}`, amount: s.currentPrice * s.shares });
  renderAll();
  try {
    await WOS_API.holdings.remove('stocks', id);
  } catch (err) {
    stocks = backup;
    renderAll();
    console.error('[WOS] remove error:', err); showToast('Remove failed: ' + ((err && (err.message || (err.data && err.data.message))) || 'Unknown error'));
  }
}

// ─── Render all ───────────────────────────────────────────────────────────────
function renderAll() {
  renderKPIs();
  renderTable();
  updateCharts();
}

// ══════════════════════════════════════════════════════════════
//  BONOS GUBERNAMENTALES DASHBOARD
// ══════════════════════════════════════════════════════════════

// ─── Instrument colour map ────────────────────────────────────────────────────
const INSTRUMENTO_COLORS = {
  'CETES':    '#6366f1',
  'BONDES D': '#34d399',
  'M-Bonos':  '#fbbf24',
  'UDIBONOS': '#f87171',
};
function instrColor(tipo) { return INSTRUMENTO_COLORS[tipo] || '#8b5cf6'; }

// ─── State ────────────────────────────────────────────────────────────────────
let bonos = [];
let bonosCatalog = null;   // { catalog: [...], tipos: [...] } — loaded once on first modal open
let bonosLineRangeDays = 7;
let bonosLineChart, bonosDonutChart, bonosBarChart;
let editingBonoId = null;
let bonosSortCol = null, bonosSortDir = 1;

// ─── Sort ─────────────────────────────────────────────────────────────────────
function sortBonos(col) {
  bonosSortDir = (bonosSortCol === col) ? -bonosSortDir : 1;
  bonosSortCol = col;
  renderBonosTable(document.querySelector('#table-bonos').closest('.holdings-panel').querySelector('.search-input').value || '');
}
function getBonoSortValue(b, col) {
  switch (col) {
    case 'tipo':         return b.tipo;
    case 'plazo':        return b.plazo;
    case 'tasaCompra':   return b.tasaCompra;
    case 'monto':        return b.monto;
    case 'purchaseDate': return b.purchaseDate;
    default:             return 0;
  }
}

// ─── KPI Rendering ────────────────────────────────────────────────────────────
function renderBonosKPIs() {
  const totalMonto    = bonos.reduce((s, b) => s + b.monto, 0);
  const weightedYield = totalMonto
    ? bonos.reduce((s, b) => s + b.tasaCompra * b.monto, 0) / totalMonto
    : 0;
  const estInterest   = bonos.reduce((s, b) => s + b.monto * (b.tasaCompra / 100), 0);

  document.getElementById('b-total-value').textContent  = fmt(totalMonto);
  document.getElementById('b-total-change').textContent = `${bonos.length} posición${bonos.length !== 1 ? 'es' : ''}`;
  document.getElementById('b-avg-yield').textContent    = weightedYield.toFixed(2) + '%';
  document.getElementById('b-gain').textContent         = fmt(estInterest);
  document.getElementById('b-invested').textContent     = bonos.length;

  renderSummaryStrip();
}

// ─── Table Rendering ──────────────────────────────────────────────────────────
function renderBonosTable(filter = '') {
  const tbody = document.getElementById('body-bonos');
  const f = filter.toLowerCase();
  tbody.innerHTML = '';

  let filtered = bonos.filter(b =>
    b.tipo.toLowerCase().includes(f) || b.plazo.toLowerCase().includes(f) ||
    (b.descripcion || '').toLowerCase().includes(f)
  );

  if (bonosSortCol) {
    filtered.sort((a, b) => {
      const va = getBonoSortValue(a, bonosSortCol);
      const vb = getBonoSortValue(b, bonosSortCol);
      return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * bonosSortDir;
    });
  }

  document.querySelectorAll('#table-bonos .th-sort').forEach(th => {
    const icon = th.querySelector('.sort-icon');
    if (th.dataset.col === bonosSortCol) {
      icon.textContent = bonosSortDir === 1 ? '↑' : '↓';
      th.classList.add('th-sort--active');
    } else {
      icon.textContent = '↕';
      th.classList.remove('th-sort--active');
    }
  });

  document.getElementById('bonos-count').textContent =
    `${bonos.length} posición${bonos.length !== 1 ? 'es' : ''}`;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="table__empty">Sin posiciones en bonos gubernamentales.</td></tr>`;
    return;
  }

  filtered.forEach(b => {
    const color   = instrColor(b.tipo);
    const dateStr = b.purchaseDate
      ? new Date(b.purchaseDate + 'T12:00:00').toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })
      : '—';
    const desc = b.descripcion || b.serieBanxico || '—';

    const tr = document.createElement('tr');
    tr.className = 'table-row';
    tr.innerHTML = `
      <td><span class="s-indicator" style="background:${color};box-shadow:0 0 6px ${color}66"></span></td>
      <td class="td--ticker" style="color:${color}">${b.tipo}</td>
      <td>${b.plazo}</td>
      <td class="s-td-company" title="${desc}">${desc.length > 45 ? desc.slice(0, 42) + '…' : desc}</td>
      <td>${b.tasaCompra.toFixed(4)}%</td>
      <td>${fmt(b.monto)}</td>
      <td>${dateStr}</td>
      <td>
        <div class="s-row-actions">
          <button class="s-btn-edit" onclick="openBonoModal('${b.id}')" title="Editar">✎</button>
          <button class="btn-remove" onclick="removeBono('${b.id}')" title="Eliminar">✕</button>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });
}

function filterBonosTable(v) { renderBonosTable(v); }

// ─── Charts ───────────────────────────────────────────────────────────────────
function getBonosPortfolioHistory(n) {
  const total = bonos.reduce((s, b) => s + b.monto, 0);
  const fake  = _genFake('bonos', total);
  return fake ? fake.slice(-n) : Array(n).fill(0);
}

function initBonosCharts() {
  const pts   = getBonosPortfolioHistory(bonosLineRangeDays);
  const dates = getDateLabels(bonosLineRangeDays);
  const lineUp = pts[pts.length - 1] >= pts[0];
  const lc = lineUp ? '#6366f1' : '#f87171';

  // Line chart
  bonosLineChart = new Chart(document.getElementById('chart-bonos-line'), {
    type: 'line',
    data: {
      labels: dates,
      datasets: [{
        data: pts, borderColor: lc, borderWidth: 2, fill: true,
        backgroundColor(ctx) {
          const { chart } = ctx; const { ctx: c, chartArea } = chart;
          if (!chartArea) return 'transparent';
          const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          g.addColorStop(0, lineUp ? 'rgba(99,102,241,0.22)' : 'rgba(248,113,113,0.22)');
          g.addColorStop(1, 'rgba(0,0,0,0)'); return g;
        },
        tension: 0.45, pointRadius: 0, pointHoverRadius: 5,
        pointHoverBackgroundColor: lc, pointHoverBorderColor: '#111525', pointHoverBorderWidth: 2,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor:'#111525', borderColor:'#1e2640', borderWidth:1, titleColor:'#8892a4', bodyColor:'#eef0ff', padding:10, callbacks:{ label: ctx => '  ' + fmt(ctx.raw) } }
      },
      scales: {
        x: { grid:{ color:'#1e2640', tickLength:0 }, ticks:{ maxTicksLimit:7, color:'#3d4a63', padding:6 }, border:{ color:'#1e2640' } },
        y: { position:'right', grid:{ color:'#1a2138', tickLength:0 }, ticks:{ color:'#3d4a63', padding:8, callback: v => '$'+(v>=1000?(v/1000).toFixed(0)+'k':v.toFixed(0)) }, border:{ color:'transparent' } }
      }
    }
  });

  // Donut — allocation by tipo
  const grouped = {};
  bonos.forEach(b => { grouped[b.tipo] = (grouped[b.tipo] || 0) + b.monto; });
  const dLabels = Object.keys(grouped);
  bonosDonutChart = new Chart(document.getElementById('chart-bonos-donut'), {
    type: 'doughnut',
    data: {
      labels: dLabels,
      datasets: [{ data: dLabels.map(k => parseFloat(grouped[k].toFixed(2))), backgroundColor: dLabels.map(instrColor), borderColor:'#111525', borderWidth:3, hoverOffset:10 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout:'68%',
      plugins: {
        legend: { position:'right', labels:{ color:'#8892a4', boxWidth:9, boxHeight:9, borderRadius:99, usePointStyle:true, pointStyle:'circle', padding:14, font:{ size:11 } } },
        tooltip: { backgroundColor:'#111525', borderColor:'#1e2640', borderWidth:1, padding:10, callbacks:{ label(ctx){ const total=ctx.dataset.data.reduce((a,b)=>a+b,0); const pct=((ctx.raw/total)*100).toFixed(1); return `  ${ctx.label}:  ${fmt(ctx.raw)}  (${pct}%)`; } } }
      }
    }
  });

  // Bar — tasa compra per position
  bonosBarChart = new Chart(document.getElementById('chart-bonos-bar'), {
    type: 'bar',
    data: {
      labels: bonos.map(b => `${b.tipo} ${b.plazo}`),
      datasets: [{
        label: 'Tasa Compra',
        data: bonos.map(b => b.tasaCompra),
        backgroundColor: bonos.map(b => instrColor(b.tipo) + 'bf'),
        borderColor: bonos.map(b => instrColor(b.tipo)),
        borderWidth: 1, borderRadius: 5, borderSkipped: false,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor:'#111525', borderColor:'#1e2640', borderWidth:1, padding:10, callbacks:{ label(ctx){ return '  '+ctx.raw.toFixed(4)+'%'; } } }
      },
      scales: {
        x: { grid:{ display:false }, ticks:{ color:'#8892a4', padding:4 }, border:{ color:'#1e2640' } },
        y: { grid:{ color:'#1a2138', tickLength:0 }, ticks:{ color:'#3d4a63', padding:8, callback: v => v.toFixed(1)+'%' }, border:{ color:'transparent' } }
      }
    }
  });
}

function updateBonosCharts() {
  if (!bonosLineChart) return;
  const pts   = getBonosPortfolioHistory(bonosLineRangeDays);
  const dates = getDateLabels(bonosLineRangeDays);
  const lineUp = pts[pts.length - 1] >= pts[0];
  const lc = lineUp ? '#6366f1' : '#f87171';

  bonosLineChart.data.labels = dates;
  bonosLineChart.data.datasets[0].data = pts;
  bonosLineChart.data.datasets[0].borderColor = lc;
  bonosLineChart.update();

  const grouped = {};
  bonos.forEach(b => { grouped[b.tipo] = (grouped[b.tipo] || 0) + b.monto; });
  const dLabels = Object.keys(grouped);
  bonosDonutChart.data.labels = dLabels;
  bonosDonutChart.data.datasets[0].data = dLabels.map(k => parseFloat(grouped[k].toFixed(2)));
  bonosDonutChart.data.datasets[0].backgroundColor = dLabels.map(instrColor);
  bonosDonutChart.update();

  bonosBarChart.data.labels = bonos.map(b => `${b.tipo} ${b.plazo}`);
  bonosBarChart.data.datasets[0].data = bonos.map(b => b.tasaCompra);
  bonosBarChart.data.datasets[0].backgroundColor = bonos.map(b => instrColor(b.tipo) + 'bf');
  bonosBarChart.data.datasets[0].borderColor = bonos.map(b => instrColor(b.tipo));
  bonosBarChart.update();
}

function setBonosLineRange(days, btn) {
  bonosLineRangeDays = days;
  document.querySelectorAll('#bonos-line-range .tab').forEach(t => t.classList.remove('tab--active'));
  btn.classList.add('tab--active');
  updateBonosCharts();
}

// ─── Catalog helpers — cascading dropdown support ─────────────────────────────
function _populateBonoTipos() {
  const sel = document.getElementById('bi-tipo');
  sel.innerHTML = '';
  if (!bonosCatalog) return;
  bonosCatalog.tipos.forEach(tipo => {
    const opt = document.createElement('option');
    opt.value = tipo; opt.textContent = tipo;
    sel.appendChild(opt);
  });
}

function _populateBonoPlazo(tipo) {
  const sel = document.getElementById('bi-plazo');
  sel.innerHTML = '';
  if (!bonosCatalog) return;
  bonosCatalog.catalog.filter(e => e.tipo === tipo).forEach(e => {
    const opt = document.createElement('option');
    opt.value = e.plazo; opt.textContent = e.plazo;
    sel.appendChild(opt);
  });
}

function _resolveBonoEntry(tipo, plazo) {
  if (!bonosCatalog) return null;
  return bonosCatalog.catalog.find(e => e.tipo === tipo && e.plazo === plazo) || null;
}

// Called when tipo dropdown changes (inline onchange= handler in HTML)
function onBonoTipoChange(tipo) {
  _populateBonoPlazo(tipo);
  onBonoPlazoChange(document.getElementById('bi-plazo').value);
}

// Called when plazo dropdown changes — fills description + serie read-only fields
function onBonoPlazoChange(plazo) {
  const tipo  = document.getElementById('bi-tipo').value;
  const entry = _resolveBonoEntry(tipo, plazo);
  if (!entry) return;
  document.getElementById('bi-descripcion').value   = entry.descripcion || '';
  document.getElementById('bi-serie-banxico').value = entry.serie_banxico;
}

// ─── Lookup button ────────────────────────────────────────────────────────────
async function lookupBonoTasa() {
  const serieBanxico = document.getElementById('bi-serie-banxico').value.trim();
  if (!serieBanxico) { showToast('Selecciona un instrumento y plazo primero.'); return; }

  const btn = document.getElementById('bi-lookup-btn');
  btn.disabled = true;
  btn.textContent = 'Buscando…';

  try {
    const data = await WOS_API.bonos.getTasa(serieBanxico);
    document.getElementById('bi-tasa').value = data.tasa;
    const refEl = document.getElementById('bi-tasa-ref');
    refEl.textContent  = `Banxico · ${data.fecha} · ${data.serie_banxico}`;
    refEl.style.display = 'block';
    showToast(`Tasa: ${data.tasa}% al ${data.fecha}`);
  } catch (err) {
    showToast(err.message || 'Error al consultar Banxico. Ingresa la tasa manualmente.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Lookup';
  }
}

// ─── Open / Close Modal ───────────────────────────────────────────────────────
async function openBonoModal(id = null) {
  editingBonoId = id;
  document.getElementById('bono-modal-title').textContent =
    id ? 'Editar Bono Gubernamental' : 'Agregar Bono Gubernamental';

  // Load catalog once
  if (!bonosCatalog) {
    try {
      bonosCatalog = await WOS_API.bonos.getCatalog();
    } catch (_) {
      showToast('No se pudo cargar el catálogo. Recarga la página.');
      return;
    }
  }

  _populateBonoTipos();
  document.getElementById('bi-tasa-ref').style.display = 'none';
  document.getElementById('bi-tasa-ref').textContent   = '';

  if (id) {
    const b = bonos.find(x => x.id === id);
    if (!b) return;
    document.getElementById('bi-tipo').value          = b.tipo;
    _populateBonoPlazo(b.tipo);
    document.getElementById('bi-plazo').value         = b.plazo;
    document.getElementById('bi-descripcion').value   = b.descripcion || '';
    document.getElementById('bi-serie-banxico').value = b.serieBanxico || '';
    document.getElementById('bi-tasa').value          = b.tasaCompra;
    document.getElementById('bi-monto').value         = b.monto;
    document.getElementById('bi-fecha').value         = b.purchaseDate || '';
  } else {
    const firstTipo = bonosCatalog.tipos[0] || '';
    document.getElementById('bi-tipo').value = firstTipo;
    _populateBonoPlazo(firstTipo);
    const firstPlazo = document.getElementById('bi-plazo').value;
    onBonoPlazoChange(firstPlazo);
    document.getElementById('bi-tasa').value  = '';
    document.getElementById('bi-monto').value = '';
    document.getElementById('bi-fecha').value = '';
    // Auto-fetch the live rate for the default selection
    if (firstTipo && firstPlazo) lookupBonoTasa();
  }

  document.getElementById('bono-modal-overlay').classList.add('modal-overlay--visible');
}

function closeBonoModal(e) {
  if (!e || e.target === document.getElementById('bono-modal-overlay')) {
    document.getElementById('bono-modal-overlay').classList.remove('modal-overlay--visible');
    editingBonoId = null;
  }
}

async function saveBono() {
  const tipo         = document.getElementById('bi-tipo').value;
  const plazo        = document.getElementById('bi-plazo').value;
  const serieBanxico = document.getElementById('bi-serie-banxico').value.trim();
  const tasaCompra   = parseFloat(document.getElementById('bi-tasa').value);
  const monto        = parseFloat(document.getElementById('bi-monto').value);
  const purchaseDate = document.getElementById('bi-fecha').value || null;
  const descripcion  = document.getElementById('bi-descripcion').value || '';

  if (!tipo || !plazo || !serieBanxico || isNaN(tasaCompra) || isNaN(monto) || !purchaseDate) {
    showToast('Por favor completa todos los campos requeridos.');
    return;
  }

  const editId = editingBonoId;
  let apiAction = 'create', targetId = null, backup = null;

  if (editId) {
    const b = bonos.find(x => x.id === editId);
    backup = { ...b };
    if (b) Object.assign(b, { tipo, plazo, serieBanxico, tasaCompra, monto, purchaseDate, descripcion });
    apiAction = 'update'; targetId = editId;
  } else {
    targetId = Date.now();
    bonos.push({ id: targetId, tipo, plazo, serieBanxico, tasaCompra, monto, purchaseDate, descripcion, history: generateHistory(monto) });
  }

  logEvent({ type: editId ? 'investment_updated' : 'investment_added', category: 'Investment', icon: '🏛️', title: `${editId ? 'Updated' : 'Added'} Bono: ${tipo} ${plazo}`, detail: `Tasa: ${tasaCompra}% · Monto: ${fmt(monto)}`, amount: monto });
  renderAllBonos();
  closeBonoModal();

  try {
    const item = bonos.find(x => x.id === targetId);
    if (apiAction === 'create' && item) { const created = await WOS_API.holdings.create('bonos', item); item.id = created.id; }
    else if (apiAction === 'update' && item) { await WOS_API.holdings.update('bonos', targetId, item); }
  } catch (err) {
    if (apiAction === 'create') { bonos = bonos.filter(x => x.id !== targetId); }
    else if (backup) { const idx = bonos.findIndex(x => x.id === targetId); if (idx !== -1) bonos[idx] = backup; }
    renderAllBonos();
    console.error('[WOS] save error:', err); showToast('Save failed: ' + ((err && (err.message || (err.data && err.data.message))) || 'Unknown error'));
  }
}

async function removeBono(id) {
  if (!await confirmDelete('¿Eliminar esta posición? Esta acción no se puede deshacer.', 'Eliminar Bono')) return;
  const b = bonos.find(x => x.id === id);
  const backup = [...bonos];
  bonos = bonos.filter(x => x.id !== id);
  if (b) logEvent({ type: 'investment_removed', category: 'Investment', icon: '🏛️', title: `Removed Bono: ${b.tipo} ${b.plazo}`, detail: `Tasa: ${b.tasaCompra}% · Monto: ${fmt(b.monto)}`, amount: b.monto });
  renderAllBonos();
  try {
    await WOS_API.holdings.remove('bonos', id);
  } catch (err) {
    bonos = backup;
    renderAllBonos();
    console.error('[WOS] remove error:', err); showToast('Remove failed: ' + ((err && (err.message || (err.data && err.data.message))) || 'Unknown error'));
  }
}

function renderAllBonos() {
  renderBonosKPIs();
  renderBonosTable();
  updateBonosCharts();
}

// ══════════════════════════════════════════════════════════════
//  FONDOS DE INVERSIÓN DASHBOARD
// ══════════════════════════════════════════════════════════════

// ─── Colour map by fund type ──────────────────────────────────────────────────
const FONDO_TIPO_COLORS = {
  'Renta Variable': '#6366f1',
  'Renta Fija':     '#34d399',
  'Patrimonial':    '#fbbf24',
  'Internacional':  '#f87171',
  'Especializado':  '#8b5cf6',
};
function fondoColor(tipo) { return FONDO_TIPO_COLORS[tipo] || '#06b6d4'; }

// ─── Sample data ──────────────────────────────────────────────────────────────
const SAMPLE_FONDOS = [
  { id:1, clave:'GBMRV1',   nombre:'GBM Renta Variable',  operadora:'GBM',     unidades:500,  precioCompra:45.20, navActual:52.80, rendimiento:16.8, tipo:'Renta Variable', fechaCompra:'2023-02-10' },
  { id:2, clave:'GBMRF1',   nombre:'GBM Renta Fija',      operadora:'GBM',     unidades:1000, precioCompra:22.10, navActual:23.90, rendimiento:8.2,  tipo:'Renta Fija',     fechaCompra:'2023-06-15' },
  { id:3, clave:'NAFINB1',  nombre:'NAFINSA Renta Fija',  operadora:'NAFINSA', unidades:2000, precioCompra:10.50, navActual:11.20, rendimiento:7.5,  tipo:'Renta Fija',     fechaCompra:'2024-01-08' },
  { id:4, clave:'BNMACC1',  nombre:'Banamex Acciones',    operadora:'Banamex', unidades:300,  precioCompra:85.00, navActual:97.40, rendimiento:14.6, tipo:'Renta Variable', fechaCompra:'2022-09-20' },
  { id:5, clave:'BBVAPAT1', nombre:'BBVA Patrimonial',    operadora:'BBVA',    unidades:800,  precioCompra:18.90, navActual:20.10, rendimiento:6.3,  tipo:'Patrimonial',    fechaCompra:'2023-11-30' },
];

// ─── State ────────────────────────────────────────────────────────────────────
let fondos = [];
let fondosLineRangeDays = 7;
let fondosLineChart, fondosDonutChart, fondosBarChart;
let editingFondoId = null;
let fondosSortCol = null, fondosSortDir = 1;

function saveFondos() { /* no-op — data goes directly to API */ }

// ─── Sort ─────────────────────────────────────────────────────────────────────
function sortFondos(col) {
  fondosSortDir = (fondosSortCol === col) ? -fondosSortDir : 1;
  fondosSortCol = col;
  renderFondosTable(document.querySelector('#table-fondos').closest('.holdings-panel').querySelector('.search-input').value || '');
}
function getFondoSortValue(f, col) {
  switch (col) {
    case 'clave':        return f.clave;
    case 'nombre':       return f.nombre;
    case 'operadora':    return f.operadora;
    case 'unidades':     return f.unidades;
    case 'precioCompra': return f.precioCompra;
    case 'navActual':    return f.navActual;
    case 'value':        return f.navActual * f.unidades;
    case 'gain':         return (f.navActual - f.precioCompra) * f.unidades;
    case 'rendimiento':  return f.rendimiento;
    default:             return 0;
  }
}

// ─── KPI Rendering ────────────────────────────────────────────────────────────
function renderFondosKPIs() {
  const totalValue    = fondos.reduce((s, f) => s + f.navActual * f.unidades, 0);
  const totalInvested = fondos.reduce((s, f) => s + f.precioCompra * f.unidades, 0);
  const gain          = totalValue - totalInvested;
  const gainPct       = totalInvested ? (gain / totalInvested) * 100 : 0;
  const weightedYield = totalValue
    ? fondos.reduce((s, f) => s + f.rendimiento * (f.navActual * f.unidades), 0) / totalValue
    : 0;

  document.getElementById('f-total-value').textContent  = fmt(totalValue);
  document.getElementById('f-total-change').textContent = fmtPct(gainPct);
  document.getElementById('f-total-change').className   =
    'kpi__change ' + (gainPct >= 0 ? 'kpi__change--up' : 'kpi__change--down');

  document.getElementById('f-invested').textContent = fmt(totalInvested);

  const gainEl = document.getElementById('f-gain');
  gainEl.textContent = (gain >= 0 ? '+' : '') + fmt(gain);
  gainEl.className   = 'kpi__value kpi__value--sm ' + (gain >= 0 ? 'kpi__change--up' : 'kpi__change--down');
  document.getElementById('f-gain-pct').textContent = fmtPct(gainPct);

  document.getElementById('f-avg-yield').textContent = weightedYield.toFixed(2) + '%';

  renderSummaryStrip();
}

// ─── Table Rendering ──────────────────────────────────────────────────────────
function renderFondosTable(filter = '') {
  const tbody = document.getElementById('body-fondos');
  const f     = filter.toLowerCase();
  tbody.innerHTML = '';

  let filtered = fondos.filter(x =>
    x.clave.toLowerCase().includes(f) || x.nombre.toLowerCase().includes(f) || x.operadora.toLowerCase().includes(f)
  );

  if (fondosSortCol) {
    filtered.sort((a, b) => {
      const va = getFondoSortValue(a, fondosSortCol);
      const vb = getFondoSortValue(b, fondosSortCol);
      return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * fondosSortDir;
    });
  }

  document.querySelectorAll('#table-fondos .th-sort').forEach(th => {
    const icon = th.querySelector('.sort-icon');
    if (th.dataset.col === fondosSortCol) {
      icon.textContent = fondosSortDir === 1 ? '↑' : '↓';
      th.classList.add('th-sort--active');
    } else {
      icon.textContent = '↕';
      th.classList.remove('th-sort--active');
    }
  });

  document.getElementById('fondos-count').textContent =
    `${fondos.length} posición${fondos.length !== 1 ? 'es' : ''}`;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="11" class="table__empty">Sin posiciones en fondos de inversión.</td></tr>`;
    return;
  }

  filtered.forEach(x => {
    const mv   = x.navActual * x.unidades;
    const gain = (x.navActual - x.precioCompra) * x.unidades;
    const up   = gain >= 0;
    const color = fondoColor(x.tipo);

    const tr = document.createElement('tr');
    tr.className = 'table-row';
    tr.innerHTML = `
      <td><span class="s-indicator" style="background:${color};box-shadow:0 0 6px ${color}66"></span></td>
      <td class="td--ticker" style="color:${color}">${x.clave}</td>
      <td class="s-td-company">${x.nombre}</td>
      <td>${x.operadora}</td>
      <td>${parseFloat(x.unidades.toFixed(4))}</td>
      <td>${fmt(x.precioCompra)}</td>
      <td class="td--price">${fmt(x.navActual)}</td>
      <td>${fmt(mv)}</td>
      <td class="${up ? 'td--up' : 'td--down'}">${(up ? '+' : '') + fmt(gain)}</td>
      <td>${x.rendimiento.toFixed(2)}%</td>
      <td>
        <div class="s-row-actions">
          <button class="s-btn-edit" onclick="openFondoModal('${x.id}')" title="Editar">✎</button>
          <button class="btn-remove" onclick="removeFondo('${x.id}')" title="Eliminar">✕</button>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });
}

function filterFondosTable(v) { renderFondosTable(v); }

// ─── Charts ───────────────────────────────────────────────────────────────────
function getFondosPortfolioHistory(n) {
  const total = fondos.reduce((s, f) => s + f.navActual * f.unidades, 0);
  const fake  = _genFake('fondos', total);
  return fake ? fake.slice(-n) : Array(n).fill(0);
}

function initFondosCharts() {
  const pts    = getFondosPortfolioHistory(fondosLineRangeDays);
  const dates  = getDateLabels(fondosLineRangeDays);
  const lineUp = pts[pts.length - 1] >= pts[0];
  const lc     = lineUp ? '#6366f1' : '#f87171';

  // Line chart
  fondosLineChart = new Chart(document.getElementById('chart-fondos-line'), {
    type: 'line',
    data: {
      labels: dates,
      datasets: [{
        data: pts, borderColor: lc, borderWidth: 2, fill: true,
        backgroundColor(ctx) {
          const { chart } = ctx; const { ctx: c, chartArea } = chart;
          if (!chartArea) return 'transparent';
          const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          g.addColorStop(0, lineUp ? 'rgba(99,102,241,0.22)' : 'rgba(248,113,113,0.22)');
          g.addColorStop(1, 'rgba(0,0,0,0)'); return g;
        },
        tension: 0.45, pointRadius: 0, pointHoverRadius: 5,
        pointHoverBackgroundColor: lc, pointHoverBorderColor: '#111525', pointHoverBorderWidth: 2,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor:'#111525', borderColor:'#1e2640', borderWidth:1, titleColor:'#8892a4', bodyColor:'#eef0ff', padding:10, callbacks:{ label: ctx => '  ' + fmt(ctx.raw) } }
      },
      scales: {
        x: { grid:{ color:'#1e2640', tickLength:0 }, ticks:{ maxTicksLimit:7, color:'#3d4a63', padding:6 }, border:{ color:'#1e2640' } },
        y: { position:'right', grid:{ color:'#1a2138', tickLength:0 }, ticks:{ color:'#3d4a63', padding:8, callback: v => '$'+(v>=1000?(v/1000).toFixed(0)+'k':v.toFixed(0)) }, border:{ color:'transparent' } }
      }
    }
  });

  // Donut — allocation by fund type
  const grouped = {};
  fondos.forEach(x => { grouped[x.tipo] = (grouped[x.tipo] || 0) + x.navActual * x.unidades; });
  const dLabels = Object.keys(grouped);
  fondosDonutChart = new Chart(document.getElementById('chart-fondos-donut'), {
    type: 'doughnut',
    data: {
      labels: dLabels,
      datasets: [{ data: dLabels.map(k => parseFloat(grouped[k].toFixed(2))), backgroundColor: dLabels.map(fondoColor), borderColor:'#111525', borderWidth:3, hoverOffset:10 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout:'68%',
      plugins: {
        legend: { position:'right', labels:{ color:'#8892a4', boxWidth:9, boxHeight:9, borderRadius:99, usePointStyle:true, pointStyle:'circle', padding:14, font:{ size:11 } } },
        tooltip: { backgroundColor:'#111525', borderColor:'#1e2640', borderWidth:1, padding:10, callbacks:{ label(ctx){ const total=ctx.dataset.data.reduce((a,b)=>a+b,0); const pct=((ctx.raw/total)*100).toFixed(1); return `  ${ctx.label}:  ${fmt(ctx.raw)}  (${pct}%)`; } } }
      }
    }
  });

  // Bar — rendimiento per fund
  fondosBarChart = new Chart(document.getElementById('chart-fondos-bar'), {
    type: 'bar',
    data: {
      labels: fondos.map(x => x.clave),
      datasets: [{
        label: 'Rendimiento',
        data: fondos.map(x => x.rendimiento),
        backgroundColor: fondos.map(x => fondoColor(x.tipo) + 'bf'),
        borderColor: fondos.map(x => fondoColor(x.tipo)),
        borderWidth: 1, borderRadius: 5, borderSkipped: false,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor:'#111525', borderColor:'#1e2640', borderWidth:1, padding:10, callbacks:{ label(ctx){ return '  '+ctx.raw.toFixed(2)+'%'; } } }
      },
      scales: {
        x: { grid:{ display:false }, ticks:{ color:'#8892a4', padding:4 }, border:{ color:'#1e2640' } },
        y: { grid:{ color:'#1a2138', tickLength:0 }, ticks:{ color:'#3d4a63', padding:8, callback: v => v.toFixed(1)+'%' }, border:{ color:'transparent' } }
      }
    }
  });
}

function updateFondosCharts() {
  if (!fondosLineChart) return;
  const pts    = getFondosPortfolioHistory(fondosLineRangeDays);
  const dates  = getDateLabels(fondosLineRangeDays);
  const lineUp = pts[pts.length - 1] >= pts[0];
  const lc     = lineUp ? '#6366f1' : '#f87171';

  fondosLineChart.data.labels = dates;
  fondosLineChart.data.datasets[0].data = pts;
  fondosLineChart.data.datasets[0].borderColor = lc;
  fondosLineChart.update();

  const grouped = {};
  fondos.forEach(x => { grouped[x.tipo] = (grouped[x.tipo] || 0) + x.navActual * x.unidades; });
  const dLabels = Object.keys(grouped);
  fondosDonutChart.data.labels = dLabels;
  fondosDonutChart.data.datasets[0].data = dLabels.map(k => parseFloat(grouped[k].toFixed(2)));
  fondosDonutChart.data.datasets[0].backgroundColor = dLabels.map(fondoColor);
  fondosDonutChart.update();

  fondosBarChart.data.labels = fondos.map(x => x.clave);
  fondosBarChart.data.datasets[0].data = fondos.map(x => x.rendimiento);
  fondosBarChart.data.datasets[0].backgroundColor = fondos.map(x => fondoColor(x.tipo) + 'bf');
  fondosBarChart.data.datasets[0].borderColor = fondos.map(x => fondoColor(x.tipo));
  fondosBarChart.update();
}

function setFondosLineRange(days, btn) {
  fondosLineRangeDays = days;
  document.querySelectorAll('#fondos-line-range .tab').forEach(t => t.classList.remove('tab--active'));
  btn.classList.add('tab--active');
  updateFondosCharts();
}

// ─── Add / Edit Modal ─────────────────────────────────────────────────────────
function openFondoModal(id = null) {
  editingFondoId = id;
  document.getElementById('fondo-modal-title').textContent = id ? 'Editar Fondo' : 'Agregar Fondo';
  if (id) {
    const x = fondos.find(f => f.id === id);
    if (!x) return;
    document.getElementById('fi-clave').value       = x.clave;
    document.getElementById('fi-nombre').value      = x.nombre;
    document.getElementById('fi-operadora').value   = x.operadora;
    document.getElementById('fi-tipo').value        = x.tipo;
    document.getElementById('fi-unidades').value    = x.unidades;
    document.getElementById('fi-compra').value      = x.precioCompra;
    document.getElementById('fi-nav').value         = x.navActual;
    document.getElementById('fi-rendimiento').value = x.rendimiento;
    document.getElementById('fi-fecha').value       = x.fechaCompra || '';
  } else {
    ['fi-clave','fi-nombre','fi-operadora','fi-unidades','fi-compra','fi-nav','fi-rendimiento','fi-fecha']
      .forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('fi-tipo').value = 'Renta Variable';
  }
  document.getElementById('fondo-modal-overlay').classList.add('modal-overlay--visible');
}

function closeFondoModal(e) {
  if (!e || e.target === document.getElementById('fondo-modal-overlay')) {
    document.getElementById('fondo-modal-overlay').classList.remove('modal-overlay--visible');
    editingFondoId = null;
  }
}

async function saveFondo() {
  const clave        = document.getElementById('fi-clave').value.trim().toUpperCase();
  const nombre       = document.getElementById('fi-nombre').value.trim();
  const operadora    = document.getElementById('fi-operadora').value.trim();
  const tipo         = document.getElementById('fi-tipo').value;
  const unidades     = parseFloat(document.getElementById('fi-unidades').value);
  const precioCompra = parseFloat(document.getElementById('fi-compra').value);
  const navActual    = parseFloat(document.getElementById('fi-nav').value);
  const rendimiento  = parseFloat(document.getElementById('fi-rendimiento').value);
  const fechaCompra  = document.getElementById('fi-fecha').value || null;

  if (!clave || !nombre || !operadora || isNaN(unidades) || isNaN(precioCompra) || isNaN(navActual) || isNaN(rendimiento)) {
    alert('Por favor completa todos los campos.');
    return;
  }

  const editId = editingFondoId;
  let apiAction = 'create', targetId = null, backup = null;

  if (editId) {
    const x = fondos.find(f => f.id === editId);
    backup = { ...x };
    if (x) Object.assign(x, { clave, nombre, operadora, tipo, unidades, precioCompra, navActual, rendimiento, fechaCompra });
    apiAction = 'update'; targetId = editId;
  } else {
    const existing = fondos.find(f => f.clave === clave);
    if (existing) {
      backup = { ...existing };
      const totalUnidades = existing.unidades + unidades;
      existing.precioCompra = (existing.unidades * existing.precioCompra + unidades * precioCompra) / totalUnidades;
      existing.unidades = totalUnidades; existing.navActual = navActual; existing.rendimiento = rendimiento;
      if (fechaCompra && !existing.fechaCompra) existing.fechaCompra = fechaCompra;
      showToast(`Posición consolidada con ${clave}.`);
      apiAction = 'update'; targetId = existing.id;
    } else {
      targetId = Date.now();
      fondos.push({ id: targetId, clave, nombre, operadora, tipo, unidades, precioCompra, navActual, rendimiento, fechaCompra, history: generateHistory(navActual * unidades) });
    }
  }

  logEvent({ type: editId ? 'investment_updated' : 'investment_added', category: 'Investment', icon: '📊', title: `${editId ? 'Updated' : 'Added'} Fondo: ${clave}`, detail: `${unidades} unidades · ${nombre} (${operadora})`, amount: navActual * unidades });
  renderAllFondos();
  closeFondoModal();

  try {
    const item = fondos.find(f => f.id === targetId);
    if (apiAction === 'create' && item) { const created = await WOS_API.holdings.create('fondos', item); item.id = created.id; }
    else if (apiAction === 'update' && item) { await WOS_API.holdings.update('fondos', targetId, item); }
  } catch (err) {
    if (apiAction === 'create') { fondos = fondos.filter(f => f.id !== targetId); }
    else if (backup) { const idx = fondos.findIndex(f => f.id === targetId); if (idx !== -1) fondos[idx] = backup; }
    renderAllFondos();
    console.error('[WOS] save error:', err); showToast('Save failed: ' + ((err && (err.message || (err.data && err.data.message))) || 'Unknown error'));
  }
}

async function removeFondo(id) {
  if (!await confirmDelete('¿Eliminar esta posición? Esta acción no se puede deshacer.', 'Eliminar Fondo')) return;
  const f = fondos.find(x => x.id === id);
  const backup = [...fondos];
  fondos = fondos.filter(x => x.id !== id);
  if (f) logEvent({ type: 'investment_removed', category: 'Investment', icon: '📊', title: `Removed Fondo: ${f.clave}`, detail: `${f.unidades} unidades · ${f.nombre}`, amount: f.navActual * f.unidades });
  renderAllFondos();
  try {
    await WOS_API.holdings.remove('fondos', id);
  } catch (err) {
    fondos = backup;
    renderAllFondos();
    console.error('[WOS] remove error:', err); showToast('Remove failed: ' + ((err && (err.message || (err.data && err.data.message))) || 'Unknown error'));
  }
}

function renderAllFondos() {
  renderFondosKPIs();
  renderFondosTable();
  updateFondosCharts();
}

// ══════════════════════════════════════════════════════════════
//  FIBRAS DASHBOARD
// ══════════════════════════════════════════════════════════════

// ─── Colour map by sector ─────────────────────────────────────────────────────
const FIBRA_SECTOR_COLORS = {
  'Diversificado': '#6366f1',
  'Industrial':    '#34d399',
  'Comercial':     '#fbbf24',
  'Oficinas':      '#f87171',
  'Hotelero':      '#8b5cf6',
  'Residencial':   '#06b6d4',
};
function fibraColor(sector) { return FIBRA_SECTOR_COLORS[sector] || '#ec4899'; }

// ─── Sample data ──────────────────────────────────────────────────────────────
const SAMPLE_FIBRAS = [
  { id:1, ticker:'FUNO11',    nombre:'Fibra Uno',       sector:'Diversificado', certificados:2000, precioCompra:22.50, precioActual:24.80, distribucion:1.85, rendimiento:10.2, fechaCompra:'2023-04-18' },
  { id:2, ticker:'TERRA13',   nombre:'Terrafina',       sector:'Industrial',    certificados:3000, precioCompra:16.10, precioActual:18.40, distribucion:1.60, rendimiento:11.8, fechaCompra:'2022-10-05' },
  { id:3, ticker:'FIBRAMQ12', nombre:'Fibra Macquarie', sector:'Industrial',    certificados:1500, precioCompra:20.30, precioActual:21.90, distribucion:1.72, rendimiento:9.5,  fechaCompra:'2024-03-12' },
  { id:4, ticker:'DANHOS13',  nombre:'Fibra Danhos',    sector:'Comercial',     certificados:1000, precioCompra:18.70, precioActual:17.20, distribucion:1.40, rendimiento:7.8,  fechaCompra:'2023-08-28' },
  { id:5, ticker:'FIBRAPL14', nombre:'Fibra PL',        sector:'Industrial',    certificados:4000, precioCompra:11.20, precioActual:13.10, distribucion:1.15, rendimiento:12.4, fechaCompra:'2024-01-22' },
];

// ─── State ────────────────────────────────────────────────────────────────────
let fibras = [];
let fibrasLineRangeDays = 7;
let fibrasLineChart, fibrasDonutChart, fibrasBarChart;
let editingFibraId = null;
let fibrasSortCol = null, fibrasSortDir = 1;

function saveFibras() { /* no-op — data goes directly to API */ }

// ─── Sort ─────────────────────────────────────────────────────────────────────
function sortFibras(col) {
  fibrasSortDir = (fibrasSortCol === col) ? -fibrasSortDir : 1;
  fibrasSortCol = col;
  renderFibrasTable(document.querySelector('#table-fibras').closest('.holdings-panel').querySelector('.search-input').value || '');
}
function getFibraSortValue(f, col) {
  switch (col) {
    case 'ticker':        return f.ticker;
    case 'nombre':        return f.nombre;
    case 'sector':        return f.sector;
    case 'certificados':  return f.certificados;
    case 'precioCompra':  return f.precioCompra;
    case 'precioActual':  return f.precioActual;
    case 'value':         return f.precioActual * f.certificados;
    case 'gain':          return (f.precioActual - f.precioCompra) * f.certificados;
    case 'rendimiento':   return f.rendimiento;
    case 'divYield':      return f.precioActual ? (f.distribucion / f.precioActual) * 100 : 0;
    default:              return 0;
  }
}

// ─── KPI Rendering ────────────────────────────────────────────────────────────
function renderFibrasKPIs() {
  const totalValue    = fibras.reduce((s, f) => s + f.precioActual * f.certificados, 0);
  const totalInvested = fibras.reduce((s, f) => s + f.precioCompra * f.certificados, 0);
  const gain          = totalValue - totalInvested;
  const gainPct       = totalInvested ? (gain / totalInvested) * 100 : 0;
  const totalDist     = fibras.reduce((s, f) => s + f.distribucion * f.certificados, 0);

  document.getElementById('fib-total-value').textContent  = fmt(totalValue);
  document.getElementById('fib-total-change').textContent = fmtPct(gainPct);
  document.getElementById('fib-total-change').className   =
    'kpi__change ' + (gainPct >= 0 ? 'kpi__change--up' : 'kpi__change--down');

  document.getElementById('fib-invested').textContent = fmt(totalInvested);

  const gainEl = document.getElementById('fib-gain');
  gainEl.textContent = (gain >= 0 ? '+' : '') + fmt(gain);
  gainEl.className   = 'kpi__value kpi__value--sm ' + (gain >= 0 ? 'kpi__change--up' : 'kpi__change--down');
  document.getElementById('fib-gain-pct').textContent = fmtPct(gainPct);

  document.getElementById('fib-dist').textContent = fmt(totalDist);

  renderSummaryStrip();
}

// ─── Table Rendering ──────────────────────────────────────────────────────────
function renderFibrasTable(filter = '') {
  const tbody = document.getElementById('body-fibras');
  const f     = filter.toLowerCase();
  tbody.innerHTML = '';

  let filtered = fibras.filter(x =>
    x.ticker.toLowerCase().includes(f) || x.nombre.toLowerCase().includes(f) || x.sector.toLowerCase().includes(f)
  );

  if (fibrasSortCol) {
    filtered.sort((a, b) => {
      const va = getFibraSortValue(a, fibrasSortCol);
      const vb = getFibraSortValue(b, fibrasSortCol);
      return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * fibrasSortDir;
    });
  }

  document.querySelectorAll('#table-fibras .th-sort').forEach(th => {
    const icon = th.querySelector('.sort-icon');
    if (th.dataset.col === fibrasSortCol) {
      icon.textContent = fibrasSortDir === 1 ? '↑' : '↓';
      th.classList.add('th-sort--active');
    } else {
      icon.textContent = '↕';
      th.classList.remove('th-sort--active');
    }
  });

  document.getElementById('fibras-count').textContent =
    `${fibras.length} posición${fibras.length !== 1 ? 'es' : ''}`;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="12" class="table__empty">Sin posiciones en Fibras.</td></tr>`;
    return;
  }

  filtered.forEach(x => {
    const mv       = x.precioActual * x.certificados;
    const gain     = (x.precioActual - x.precioCompra) * x.certificados;
    const up       = gain >= 0;
    const divYield = x.precioActual ? (x.distribucion / x.precioActual) * 100 : 0;
    const color    = fibraColor(x.sector);

    const tr = document.createElement('tr');
    tr.className = 'table-row';
    tr.innerHTML = `
      <td><span class="s-indicator" style="background:${color};box-shadow:0 0 6px ${color}66"></span></td>
      <td class="td--ticker" style="color:${color}">${x.ticker}</td>
      <td class="s-td-company">${x.nombre}</td>
      <td>${x.sector}</td>
      <td>${x.certificados.toLocaleString()}</td>
      <td>${fmt(x.precioCompra)}</td>
      <td class="td--price">${fmt(x.precioActual)}</td>
      <td>${fmt(mv)}</td>
      <td class="${up ? 'td--up' : 'td--down'}">${(up ? '+' : '') + fmt(gain)}</td>
      <td class="${up ? 'td--up' : 'td--down'}">${fmtPct(x.rendimiento)}</td>
      <td>${divYield.toFixed(2)}%</td>
      <td>
        <div class="s-row-actions">
          <button class="s-btn-edit" onclick="openFibraModal('${x.id}')" title="Editar">✎</button>
          <button class="btn-remove" onclick="removeFibra('${x.id}')" title="Eliminar">✕</button>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });
}

function filterFibrasTable(v) { renderFibrasTable(v); }

// ─── Charts ───────────────────────────────────────────────────────────────────
function getFibrasPortfolioHistory(n) {
  const series = _sliceHistory(_fibrasHistory, n);
  if (series) return series.map(([, v]) => v);
  const total = fibras.reduce((s, f) => s + f.precioActual * f.certificados, 0);
  const days  = _daysSincePurchase(fibras, 'fechaCompra');
  const clamp = days ? Math.min(n, days) : n;
  const fake  = _genFake('fibras', total);
  return fake ? fake.slice(-clamp) : Array(clamp).fill(0);
}

function initFibrasCharts() {
  const pts    = getFibrasPortfolioHistory(fibrasLineRangeDays);
  const dates  = getRealDateLabels(_fibrasHistory, fibrasLineRangeDays, _daysSincePurchase(fibras, 'fechaCompra'));
  const lineUp = pts[pts.length - 1] >= pts[0];
  const lc     = lineUp ? '#6366f1' : '#f87171';

  // Line chart
  fibrasLineChart = new Chart(document.getElementById('chart-fibras-line'), {
    type: 'line',
    data: {
      labels: dates,
      datasets: [{
        data: pts, borderColor: lc, borderWidth: 2, fill: true,
        backgroundColor(ctx) {
          const { chart } = ctx; const { ctx: c, chartArea } = chart;
          if (!chartArea) return 'transparent';
          const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          g.addColorStop(0, lineUp ? 'rgba(99,102,241,0.22)' : 'rgba(248,113,113,0.22)');
          g.addColorStop(1, 'rgba(0,0,0,0)'); return g;
        },
        tension: 0.45, pointRadius: 0, pointHoverRadius: 5,
        pointHoverBackgroundColor: lc, pointHoverBorderColor: '#111525', pointHoverBorderWidth: 2,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor:'#111525', borderColor:'#1e2640', borderWidth:1, titleColor:'#8892a4', bodyColor:'#eef0ff', padding:10, callbacks:{ label: ctx => '  ' + fmt(ctx.raw) } }
      },
      scales: {
        x: { grid:{ color:'#1e2640', tickLength:0 }, ticks:{ maxTicksLimit:7, color:'#3d4a63', padding:6 }, border:{ color:'#1e2640' } },
        y: { position:'right', grid:{ color:'#1a2138', tickLength:0 }, ticks:{ color:'#3d4a63', padding:8, callback: v => '$'+(v>=1000?(v/1000).toFixed(0)+'k':v.toFixed(0)) }, border:{ color:'transparent' } }
      }
    }
  });

  // Donut — allocation by sector
  const grouped = {};
  fibras.forEach(x => { grouped[x.sector] = (grouped[x.sector] || 0) + x.precioActual * x.certificados; });
  const dLabels = Object.keys(grouped);
  fibrasDonutChart = new Chart(document.getElementById('chart-fibras-donut'), {
    type: 'doughnut',
    data: {
      labels: dLabels,
      datasets: [{ data: dLabels.map(k => parseFloat(grouped[k].toFixed(2))), backgroundColor: dLabels.map(fibraColor), borderColor:'#111525', borderWidth:3, hoverOffset:10 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout:'68%',
      plugins: {
        legend: { position:'right', labels:{ color:'#8892a4', boxWidth:9, boxHeight:9, borderRadius:99, usePointStyle:true, pointStyle:'circle', padding:14, font:{ size:11 } } },
        tooltip: { backgroundColor:'#111525', borderColor:'#1e2640', borderWidth:1, padding:10, callbacks:{ label(ctx){ const total=ctx.dataset.data.reduce((a,b)=>a+b,0); const pct=((ctx.raw/total)*100).toFixed(1); return `  ${ctx.label}:  ${fmt(ctx.raw)}  (${pct}%)`; } } }
      }
    }
  });

  // Bar — dividend yield per fibra
  fibrasBarChart = new Chart(document.getElementById('chart-fibras-bar'), {
    type: 'bar',
    data: {
      labels: fibras.map(x => x.ticker),
      datasets: [{
        label: 'Div. Yield',
        data: fibras.map(x => x.precioActual ? parseFloat(((x.distribucion / x.precioActual) * 100).toFixed(2)) : 0),
        backgroundColor: fibras.map(x => fibraColor(x.sector) + 'bf'),
        borderColor: fibras.map(x => fibraColor(x.sector)),
        borderWidth: 1, borderRadius: 5, borderSkipped: false,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor:'#111525', borderColor:'#1e2640', borderWidth:1, padding:10, callbacks:{ label(ctx){ return '  '+ctx.raw.toFixed(2)+'%'; } } }
      },
      scales: {
        x: { grid:{ display:false }, ticks:{ color:'#8892a4', padding:4 }, border:{ color:'#1e2640' } },
        y: { grid:{ color:'#1a2138', tickLength:0 }, ticks:{ color:'#3d4a63', padding:8, callback: v => v.toFixed(1)+'%' }, border:{ color:'transparent' } }
      }
    }
  });
}

function updateFibrasCharts() {
  if (!fibrasLineChart) return;
  const pts    = getFibrasPortfolioHistory(fibrasLineRangeDays);
  const dates  = getRealDateLabels(_fibrasHistory, fibrasLineRangeDays, _daysSincePurchase(fibras, 'fechaCompra'));
  const lineUp = pts[pts.length - 1] >= pts[0];
  const lc     = lineUp ? '#6366f1' : '#f87171';

  fibrasLineChart.data.labels = dates;
  fibrasLineChart.data.datasets[0].data = pts;
  fibrasLineChart.data.datasets[0].borderColor = lc;
  fibrasLineChart.update();

  const grouped = {};
  fibras.forEach(x => { grouped[x.sector] = (grouped[x.sector] || 0) + x.precioActual * x.certificados; });
  const dLabels = Object.keys(grouped);
  fibrasDonutChart.data.labels = dLabels;
  fibrasDonutChart.data.datasets[0].data = dLabels.map(k => parseFloat(grouped[k].toFixed(2)));
  fibrasDonutChart.data.datasets[0].backgroundColor = dLabels.map(fibraColor);
  fibrasDonutChart.update();

  fibrasBarChart.data.labels = fibras.map(x => x.ticker);
  fibrasBarChart.data.datasets[0].data = fibras.map(x => x.precioActual ? parseFloat(((x.distribucion / x.precioActual) * 100).toFixed(2)) : 0);
  fibrasBarChart.data.datasets[0].backgroundColor = fibras.map(x => fibraColor(x.sector) + 'bf');
  fibrasBarChart.data.datasets[0].borderColor = fibras.map(x => fibraColor(x.sector));
  fibrasBarChart.update();
}

function setFibrasLineRange(days, btn) {
  fibrasLineRangeDays = days;
  document.querySelectorAll('#fibras-line-range .tab').forEach(t => t.classList.remove('tab--active'));
  btn.classList.add('tab--active');
  updateFibrasCharts();
}

// ─── Add / Edit Modal ─────────────────────────────────────────────────────────
function openFibraModal(id = null) {
  editingFibraId = id;
  document.getElementById('fibra-modal-title').textContent = id ? 'Editar Fibra' : 'Agregar Fibra';
  if (id) {
    const x = fibras.find(f => f.id === id);
    if (!x) return;
    document.getElementById('fbi-ticker').value       = x.ticker;
    document.getElementById('fbi-nombre').value       = x.nombre;
    document.getElementById('fbi-sector').value       = x.sector;
    document.getElementById('fbi-certificados').value = x.certificados;
    document.getElementById('fbi-compra').value       = x.precioCompra;
    document.getElementById('fbi-actual').value       = x.precioActual;
    document.getElementById('fbi-distribucion').value = x.distribucion;
    document.getElementById('fbi-rendimiento').value  = x.rendimiento;
    document.getElementById('fbi-fecha').value        = x.fechaCompra || '';
  } else {
    ['fbi-ticker','fbi-nombre','fbi-certificados','fbi-compra','fbi-actual','fbi-distribucion','fbi-rendimiento','fbi-fecha']
      .forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('fbi-sector').value = 'Diversificado';
  }
  document.getElementById('fibra-modal-overlay').classList.add('modal-overlay--visible');
}

function closeFibraModal(e) {
  if (!e || e.target === document.getElementById('fibra-modal-overlay')) {
    document.getElementById('fibra-modal-overlay').classList.remove('modal-overlay--visible');
    editingFibraId = null;
  }
}

async function saveFibra() {
  const ticker       = document.getElementById('fbi-ticker').value.trim().toUpperCase();
  const nombre       = document.getElementById('fbi-nombre').value.trim();
  const sector       = document.getElementById('fbi-sector').value;
  const certificados = parseInt(document.getElementById('fbi-certificados').value);
  const precioCompra = parseFloat(document.getElementById('fbi-compra').value);
  const precioActual = parseFloat(document.getElementById('fbi-actual').value);
  const distribucion = parseFloat(document.getElementById('fbi-distribucion').value);
  const rendimiento  = parseFloat(document.getElementById('fbi-rendimiento').value);
  const fechaCompra  = document.getElementById('fbi-fecha').value || null;

  if (!ticker || !nombre || isNaN(certificados) || isNaN(precioCompra) || isNaN(precioActual) || isNaN(distribucion) || isNaN(rendimiento)) {
    alert('Por favor completa todos los campos.');
    return;
  }

  const editId = editingFibraId;
  let apiAction = 'create', targetId = null, backup = null;

  if (editId) {
    const x = fibras.find(f => f.id === editId);
    backup = { ...x };
    if (x) Object.assign(x, { ticker, nombre, sector, certificados, precioCompra, precioActual, distribucion, rendimiento, fechaCompra });
    apiAction = 'update'; targetId = editId;
  } else {
    const existing = fibras.find(f => f.ticker === ticker);
    if (existing) {
      backup = { ...existing };
      const totalCerts = existing.certificados + certificados;
      existing.precioCompra = (existing.certificados * existing.precioCompra + certificados * precioCompra) / totalCerts;
      existing.certificados = totalCerts; existing.precioActual = precioActual; existing.distribucion = distribucion; existing.rendimiento = rendimiento;
      if (fechaCompra && !existing.fechaCompra) existing.fechaCompra = fechaCompra;
      showToast(`Posición consolidada con ${ticker}.`);
      apiAction = 'update'; targetId = existing.id;
    } else {
      targetId = Date.now();
      fibras.push({ id: targetId, ticker, nombre, sector, certificados, precioCompra, precioActual, distribucion, rendimiento, fechaCompra, history: generateHistory(precioActual * certificados) });
    }
  }

  logEvent({ type: editId ? 'investment_updated' : 'investment_added', category: 'Investment', icon: '🏢', title: `${editId ? 'Updated' : 'Added'} Fibra: ${ticker}`, detail: `${certificados} certificados @ $${precioCompra} · ${nombre}`, amount: precioActual * certificados });
  renderAllFibras();
  closeFibraModal();

  try {
    const item = fibras.find(f => f.id === targetId);
    if (apiAction === 'create' && item) { const created = await WOS_API.holdings.create('fibras', item); item.id = created.id; }
    else if (apiAction === 'update' && item) { await WOS_API.holdings.update('fibras', targetId, item); }
  } catch (err) {
    if (apiAction === 'create') { fibras = fibras.filter(f => f.id !== targetId); }
    else if (backup) { const idx = fibras.findIndex(f => f.id === targetId); if (idx !== -1) fibras[idx] = backup; }
    renderAllFibras();
    console.error('[WOS] save error:', err); showToast('Save failed: ' + ((err && (err.message || (err.data && err.data.message))) || 'Unknown error'));
  }
}

async function removeFibra(id) {
  if (!await confirmDelete('¿Eliminar esta posición? Esta acción no se puede deshacer.', 'Eliminar Fibra')) return;
  const f = fibras.find(x => x.id === id);
  const backup = [...fibras];
  fibras = fibras.filter(x => x.id !== id);
  if (f) logEvent({ type: 'investment_removed', category: 'Investment', icon: '🏢', title: `Removed Fibra: ${f.ticker}`, detail: `${f.certificados} certificados · ${f.nombre}`, amount: f.precioActual * f.certificados });
  renderAllFibras();
  try {
    await WOS_API.holdings.remove('fibras', id);
  } catch (err) {
    fibras = backup;
    renderAllFibras();
    console.error('[WOS] remove error:', err); showToast('Remove failed: ' + ((err && (err.message || (err.data && err.data.message))) || 'Unknown error'));
  }
}

function renderAllFibras() {
  renderFibrasKPIs();
  renderFibrasTable();
  updateFibrasCharts();
}

// ══════════════════════════════════════════════════════════════
//  FONDOS PARA EL RETIRO DASHBOARD
// ══════════════════════════════════════════════════════════════

// ─── Colour map by tipo ───────────────────────────────────────────────────────
const RETIRO_TIPO_COLORS = {
  'PPR':              '#6366f1',
  'Afore':            '#34d399',
  'Plan Empresarial': '#fbbf24',
  'Pensión IMSS':     '#f87171',
};
function retiroColor(tipo) { return RETIRO_TIPO_COLORS[tipo] || '#8b5cf6'; }

// ─── Sample data ──────────────────────────────────────────────────────────────
const SAMPLE_RETIRO = [
  { id:1, tipo:'Afore',            nombre:'Afore Profuturo Siefore Básica',   institucion:'Profuturo',  subcuenta:'Retiro',           saldo:320000, aportacionYTD:48000, aportacionPatronal:24000, rendimiento:8.2,  proyeccion:4200000, fechaCompra:'2018-01-15' },
  { id:2, tipo:'PPR',              nombre:'PPR GBM Crecimiento',              institucion:'GBM',        subcuenta:'Voluntario',        saldo:185000, aportacionYTD:60000, aportacionPatronal:0,     rendimiento:9.5,  proyeccion:2800000, fechaCompra:'2021-03-10' },
  { id:3, tipo:'PPR',              nombre:'PPR BBVA Patrimonial',             institucion:'BBVA',       subcuenta:'Voluntario',        saldo:95000,  aportacionYTD:36000, aportacionPatronal:0,     rendimiento:10.1, proyeccion:1500000, fechaCompra:'2022-07-01' },
  { id:4, tipo:'Plan Empresarial', nombre:'Plan de Pensiones Empresarial',    institucion:'Banamex',    subcuenta:'Empresarial',       saldo:210000, aportacionYTD:72000, aportacionPatronal:72000, rendimiento:7.8,  proyeccion:3100000, fechaCompra:'2019-09-20' },
  { id:5, tipo:'Afore',            nombre:'Afore Profuturo Cesantía',         institucion:'Profuturo',  subcuenta:'Cesantía y Vejez',  saldo:145000, aportacionYTD:22000, aportacionPatronal:11000, rendimiento:8.0,  proyeccion:1900000, fechaCompra:'2018-01-15' },
];

// ─── State ────────────────────────────────────────────────────────────────────
let retiro = [];
let retiroLineRangeDays = 7;
let retiroLineChart, retiroDonutChart, retiroBarChart;
let editingRetiroId = null;
let retiroSortCol = null, retiroSortDir = 1;

function persistRetiro() { /* no-op — data goes directly to API */ }

// ─── Sort ─────────────────────────────────────────────────────────────────────
function sortRetiro(col) {
  retiroSortDir = (retiroSortCol === col) ? -retiroSortDir : 1;
  retiroSortCol = col;
  renderRetiroTable(document.querySelector('#table-retiro').closest('.holdings-panel').querySelector('.search-input').value || '');
}
function getRetiroSortValue(r, col) {
  switch (col) {
    case 'tipo':               return r.tipo;
    case 'nombre':             return r.nombre;
    case 'institucion':        return r.institucion;
    case 'subcuenta':          return r.subcuenta;
    case 'saldo':              return r.saldo;
    case 'aportacionYTD':      return r.aportacionYTD;
    case 'aportacionPatronal': return r.aportacionPatronal;
    case 'rendimiento':        return r.rendimiento;
    case 'proyeccion':         return r.proyeccion;
    default:                   return 0;
  }
}

// ─── KPI Rendering ────────────────────────────────────────────────────────────
function renderRetiroKPIs() {
  const totalSaldo      = retiro.reduce((s, r) => s + r.saldo, 0);
  const totalAportacion = retiro.reduce((s, r) => s + (r.aportacionYTD || 0), 0);
  const totalProyeccion = retiro.reduce((s, r) => s + (r.proyeccion || 0), 0);
  const weightedYield   = totalSaldo
    ? retiro.reduce((s, r) => s + r.rendimiento * r.saldo, 0) / totalSaldo
    : 0;
  const prevSaldo = retiro.reduce((s, r) => {
    const hist = r.history || [];
    return s + (hist.length >= 2 ? hist[hist.length - 2] : r.saldo);
  }, 0);
  const changePct = prevSaldo ? ((totalSaldo - prevSaldo) / prevSaldo) * 100 : 0;

  document.getElementById('r-total-value').textContent  = fmt(totalSaldo);
  document.getElementById('r-total-change').textContent = fmtPct(changePct);
  document.getElementById('r-total-change').className   =
    'kpi__change ' + (changePct >= 0 ? 'kpi__change--up' : 'kpi__change--down');

  document.getElementById('r-aportaciones').textContent = fmt(totalAportacion);
  document.getElementById('r-avg-yield').textContent    = weightedYield.toFixed(2) + '%';
  document.getElementById('r-proyeccion').textContent   = fmt(totalProyeccion);

  renderSummaryStrip();
}

// ─── Table Rendering ──────────────────────────────────────────────────────────
function renderRetiroTable(filter = '') {
  const tbody = document.getElementById('body-retiro');
  const f     = filter.toLowerCase();
  tbody.innerHTML = '';

  let filtered = retiro.filter(r =>
    r.tipo.toLowerCase().includes(f) ||
    r.nombre.toLowerCase().includes(f) ||
    r.institucion.toLowerCase().includes(f) ||
    (r.subcuenta || '').toLowerCase().includes(f)
  );

  if (retiroSortCol) {
    filtered.sort((a, b) => {
      const va = getRetiroSortValue(a, retiroSortCol);
      const vb = getRetiroSortValue(b, retiroSortCol);
      return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * retiroSortDir;
    });
  }

  document.querySelectorAll('#table-retiro .th-sort').forEach(th => {
    const icon = th.querySelector('.sort-icon');
    if (th.dataset.col === retiroSortCol) {
      icon.textContent = retiroSortDir === 1 ? '↑' : '↓';
      th.classList.add('th-sort--active');
    } else {
      icon.textContent = '↕';
      th.classList.remove('th-sort--active');
    }
  });

  document.getElementById('retiro-count').textContent =
    `${retiro.length} posición${retiro.length !== 1 ? 'es' : ''}`;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="11" class="table__empty">Sin posiciones de retiro aún.</td></tr>`;
    return;
  }

  filtered.forEach(r => {
    const color = retiroColor(r.tipo);
    const tr    = document.createElement('tr');
    tr.className = 'table-row';
    tr.innerHTML = `
      <td><span class="s-indicator" style="background:${color};box-shadow:0 0 6px ${color}66"></span></td>
      <td class="td--ticker" style="color:${color}">${r.tipo}</td>
      <td class="s-td-company">${r.nombre}</td>
      <td>${r.institucion}</td>
      <td>${r.subcuenta}</td>
      <td>${fmt(r.saldo)}</td>
      <td>${fmt(r.aportacionYTD || 0)}</td>
      <td>${fmt(r.aportacionPatronal || 0)}</td>
      <td>${r.rendimiento.toFixed(2)}%</td>
      <td>${fmt(r.proyeccion || 0)}</td>
      <td>
        <div class="s-row-actions">
          <button class="s-btn-edit" onclick="openRetiroModal('${r.id}')" title="Editar">✎</button>
          <button class="btn-remove" onclick="removeRetiro('${r.id}')" title="Eliminar">✕</button>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });
}

function filterRetiroTable(v) { renderRetiroTable(v); }

// ─── Charts ───────────────────────────────────────────────────────────────────
function getRetiroPortfolioHistory(n) {
  const total = retiro.reduce((s, r) => s + r.saldo, 0);
  const fake  = _genFake('retiro', total);
  return fake ? fake.slice(-n) : Array(n).fill(0);
}

function initRetiroCharts() {
  const pts    = getRetiroPortfolioHistory(retiroLineRangeDays);
  const dates  = getDateLabels(retiroLineRangeDays);
  const lineUp = pts[pts.length - 1] >= pts[0];
  const lc     = lineUp ? '#6366f1' : '#f87171';

  // Line chart
  retiroLineChart = new Chart(document.getElementById('chart-retiro-line'), {
    type: 'line',
    data: {
      labels: dates,
      datasets: [{
        data: pts, borderColor: lc, borderWidth: 2, fill: true,
        backgroundColor(ctx) {
          const { chart } = ctx; const { ctx: c, chartArea } = chart;
          if (!chartArea) return 'transparent';
          const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          g.addColorStop(0, lineUp ? 'rgba(99,102,241,0.22)' : 'rgba(248,113,113,0.22)');
          g.addColorStop(1, 'rgba(0,0,0,0)'); return g;
        },
        tension: 0.45, pointRadius: 0, pointHoverRadius: 5,
        pointHoverBackgroundColor: lc, pointHoverBorderColor: '#111525', pointHoverBorderWidth: 2,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor:'#111525', borderColor:'#1e2640', borderWidth:1, titleColor:'#8892a4', bodyColor:'#eef0ff', padding:10, callbacks:{ label: ctx => '  ' + fmt(ctx.raw) } }
      },
      scales: {
        x: { grid:{ color:'#1e2640', tickLength:0 }, ticks:{ maxTicksLimit:7, color:'#3d4a63', padding:6 }, border:{ color:'#1e2640' } },
        y: { position:'right', grid:{ color:'#1a2138', tickLength:0 }, ticks:{ color:'#3d4a63', padding:8, callback: v => '$'+(v>=1000?(v/1000).toFixed(0)+'k':v.toFixed(0)) }, border:{ color:'transparent' } }
      }
    }
  });

  // Donut — allocation by tipo
  const grouped = {};
  retiro.forEach(r => { grouped[r.tipo] = (grouped[r.tipo] || 0) + r.saldo; });
  const dLabels = Object.keys(grouped);
  retiroDonutChart = new Chart(document.getElementById('chart-retiro-donut'), {
    type: 'doughnut',
    data: {
      labels: dLabels,
      datasets: [{ data: dLabels.map(k => parseFloat(grouped[k].toFixed(2))), backgroundColor: dLabels.map(retiroColor), borderColor:'#111525', borderWidth:3, hoverOffset:10 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout:'68%',
      plugins: {
        legend: { position:'right', labels:{ color:'#8892a4', boxWidth:9, boxHeight:9, borderRadius:99, usePointStyle:true, pointStyle:'circle', padding:14, font:{ size:11 } } },
        tooltip: { backgroundColor:'#111525', borderColor:'#1e2640', borderWidth:1, padding:10, callbacks:{ label(ctx){ const total=ctx.dataset.data.reduce((a,b)=>a+b,0); const pct=((ctx.raw/total)*100).toFixed(1); return `  ${ctx.label}:  ${fmt(ctx.raw)}  (${pct}%)`; } } }
      }
    }
  });

  // Bar — rendimiento per position
  retiroBarChart = new Chart(document.getElementById('chart-retiro-bar'), {
    type: 'bar',
    data: {
      labels: retiro.map(r => r.institucion),
      datasets: [{
        label: 'Rendimiento',
        data: retiro.map(r => r.rendimiento),
        backgroundColor: retiro.map(r => retiroColor(r.tipo) + 'bf'),
        borderColor: retiro.map(r => retiroColor(r.tipo)),
        borderWidth: 1, borderRadius: 5, borderSkipped: false,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor:'#111525', borderColor:'#1e2640', borderWidth:1, padding:10, callbacks:{ label(ctx){ return '  '+ctx.raw.toFixed(2)+'%'; } } }
      },
      scales: {
        x: { grid:{ display:false }, ticks:{ color:'#8892a4', padding:4 }, border:{ color:'#1e2640' } },
        y: { grid:{ color:'#1a2138', tickLength:0 }, ticks:{ color:'#3d4a63', padding:8, callback: v => v.toFixed(1)+'%' }, border:{ color:'transparent' } }
      }
    }
  });
}

function updateRetiroCharts() {
  if (!retiroLineChart) return;
  const pts    = getRetiroPortfolioHistory(retiroLineRangeDays);
  const dates  = getDateLabels(retiroLineRangeDays);
  const lineUp = pts[pts.length - 1] >= pts[0];
  const lc     = lineUp ? '#6366f1' : '#f87171';

  retiroLineChart.data.labels = dates;
  retiroLineChart.data.datasets[0].data = pts;
  retiroLineChart.data.datasets[0].borderColor = lc;
  retiroLineChart.update();

  const grouped = {};
  retiro.forEach(r => { grouped[r.tipo] = (grouped[r.tipo] || 0) + r.saldo; });
  const dLabels = Object.keys(grouped);
  retiroDonutChart.data.labels = dLabels;
  retiroDonutChart.data.datasets[0].data = dLabels.map(k => parseFloat(grouped[k].toFixed(2)));
  retiroDonutChart.data.datasets[0].backgroundColor = dLabels.map(retiroColor);
  retiroDonutChart.update();

  retiroBarChart.data.labels = retiro.map(r => r.institucion);
  retiroBarChart.data.datasets[0].data = retiro.map(r => r.rendimiento);
  retiroBarChart.data.datasets[0].backgroundColor = retiro.map(r => retiroColor(r.tipo) + 'bf');
  retiroBarChart.data.datasets[0].borderColor = retiro.map(r => retiroColor(r.tipo));
  retiroBarChart.update();
}

function setRetiroLineRange(days, btn) {
  retiroLineRangeDays = days;
  document.querySelectorAll('#retiro-line-range .tab').forEach(t => t.classList.remove('tab--active'));
  btn.classList.add('tab--active');
  updateRetiroCharts();
}

// ─── Add / Edit Modal ─────────────────────────────────────────────────────────
function openRetiroModal(id = null) {
  editingRetiroId = id;
  document.getElementById('retiro-modal-title').textContent = id ? 'Editar Fondo de Retiro' : 'Agregar Fondo de Retiro';
  if (id) {
    const r = retiro.find(x => x.id === id);
    if (!r) return;
    document.getElementById('ri-tipo').value           = r.tipo;
    document.getElementById('ri-nombre').value         = r.nombre;
    document.getElementById('ri-institucion').value    = r.institucion;
    document.getElementById('ri-subcuenta').value      = r.subcuenta;
    document.getElementById('ri-saldo').value          = r.saldo;
    document.getElementById('ri-aportacion-ytd').value = r.aportacionYTD || 0;
    document.getElementById('ri-patronal').value       = r.aportacionPatronal || 0;
    document.getElementById('ri-rendimiento').value    = r.rendimiento;
    document.getElementById('ri-proyeccion').value     = r.proyeccion || 0;
    document.getElementById('ri-fecha').value          = r.fechaCompra || '';
  } else {
    ['ri-nombre','ri-institucion','ri-saldo','ri-aportacion-ytd','ri-patronal','ri-rendimiento','ri-proyeccion','ri-fecha']
      .forEach(fid => { document.getElementById(fid).value = ''; });
    document.getElementById('ri-tipo').value      = 'PPR';
    document.getElementById('ri-subcuenta').value = 'Voluntario';
  }
  document.getElementById('retiro-modal-overlay').classList.add('modal-overlay--visible');
}

function closeRetiroModal(e) {
  if (!e || e.target === document.getElementById('retiro-modal-overlay')) {
    document.getElementById('retiro-modal-overlay').classList.remove('modal-overlay--visible');
    editingRetiroId = null;
  }
}

async function saveRetiro() {
  const tipo               = document.getElementById('ri-tipo').value;
  const nombre             = document.getElementById('ri-nombre').value.trim();
  const institucion        = document.getElementById('ri-institucion').value.trim();
  const subcuenta          = document.getElementById('ri-subcuenta').value;
  const saldo              = parseFloat(document.getElementById('ri-saldo').value);
  const aportacionYTD      = parseFloat(document.getElementById('ri-aportacion-ytd').value) || 0;
  const aportacionPatronal = parseFloat(document.getElementById('ri-patronal').value) || 0;
  const rendimiento        = parseFloat(document.getElementById('ri-rendimiento').value);
  const proyeccion         = parseFloat(document.getElementById('ri-proyeccion').value) || 0;
  const fechaCompra        = document.getElementById('ri-fecha').value || null;

  if (!nombre || !institucion || isNaN(saldo) || isNaN(rendimiento)) {
    alert('Por favor completa todos los campos obligatorios.');
    return;
  }

  const editId = editingRetiroId;
  let apiAction = 'create', targetId = null, backup = null;

  if (editId) {
    const r = retiro.find(x => x.id === editId);
    backup = { ...r };
    if (r) Object.assign(r, { tipo, nombre, institucion, subcuenta, saldo, aportacionYTD, aportacionPatronal, rendimiento, proyeccion, fechaCompra });
    apiAction = 'update'; targetId = editId;
  } else {
    targetId = Date.now();
    retiro.push({ id: targetId, tipo, nombre, institucion, subcuenta, saldo, aportacionYTD, aportacionPatronal, rendimiento, proyeccion, fechaCompra, history: generateHistory(saldo) });
  }

  logEvent({ type: editId ? 'investment_updated' : 'investment_added', category: 'Investment', icon: '🏦', title: `${editId ? 'Updated' : 'Added'} Retiro: ${nombre}`, detail: `Saldo $${saldo.toLocaleString()} · ${tipo} (${institucion})`, amount: saldo });
  renderAllRetiro();
  closeRetiroModal();

  try {
    const item = retiro.find(x => x.id === targetId);
    if (apiAction === 'create' && item) { const created = await WOS_API.holdings.create('retiro', item); item.id = created.id; }
    else if (apiAction === 'update' && item) { await WOS_API.holdings.update('retiro', targetId, item); }
  } catch (err) {
    if (apiAction === 'create') { retiro = retiro.filter(x => x.id !== targetId); }
    else if (backup) { const idx = retiro.findIndex(x => x.id === targetId); if (idx !== -1) retiro[idx] = backup; }
    renderAllRetiro();
    console.error('[WOS] save error:', err); showToast('Save failed: ' + ((err && (err.message || (err.data && err.data.message))) || 'Unknown error'));
  }
}

async function removeRetiro(id) {
  if (!await confirmDelete('¿Eliminar esta posición? Esta acción no se puede deshacer.', 'Eliminar Retiro')) return;
  const r = retiro.find(x => x.id === id);
  const backup = [...retiro];
  retiro = retiro.filter(x => x.id !== id);
  if (r) logEvent({ type: 'investment_removed', category: 'Investment', icon: '🏦', title: `Removed Retiro: ${r.nombre}`, detail: `Saldo $${r.saldo.toLocaleString()} · ${r.tipo}`, amount: r.saldo });
  renderAllRetiro();
  try {
    await WOS_API.holdings.remove('retiro', id);
  } catch (err) {
    retiro = backup;
    renderAllRetiro();
    console.error('[WOS] remove error:', err); showToast('Remove failed: ' + ((err && (err.message || (err.data && err.data.message))) || 'Unknown error'));
  }
}

function renderAllRetiro() {
  renderRetiroKPIs();
  renderRetiroTable();
  updateRetiroCharts();
}

// ══════════════════════════════════════════════════════════════
//  BIENES Y RAÍCES DASHBOARD
// ══════════════════════════════════════════════════════════════

// ─── Colour map by tipo ───────────────────────────────────────────────────────
const BIENES_TIPO_COLORS = {
  'Casa':            '#6366f1',
  'Departamento':    '#34d399',
  'Local Comercial': '#fbbf24',
  'Terreno':         '#a3e635',
  'Bodega':          '#f87171',
};
function bienColor(tipo) { return BIENES_TIPO_COLORS[tipo] || '#06b6d4'; }

// ─── Sample data ──────────────────────────────────────────────────────────────
const SAMPLE_BIENES = [
  {
    id:1, nombre:'Casa Pedregal', tipo:'Casa', ubicacion:'CDMX – Pedregal',
    precioCompra:4500000, gastosNotariales:135000, escrituracion:45000,
    impuestoAdquisicion:90000, otrosGastos:40000,
    fechaCompra:'2021-03-01', plusvaliaAnual:6.5,
    saldoHipoteca:2100000, rentaMensual:0,
  },
  {
    id:2, nombre:'Departamento Polanco', tipo:'Departamento', ubicacion:'CDMX – Polanco',
    precioCompra:3200000, gastosNotariales:96000, escrituracion:32000,
    impuestoAdquisicion:64000, otrosGastos:28000,
    fechaCompra:'2022-01-15', plusvaliaAnual:7.0,
    saldoHipoteca:0, rentaMensual:22000,
  },
  {
    id:3, nombre:'Local Centro Histórico', tipo:'Local Comercial', ubicacion:'CDMX – Centro',
    precioCompra:1800000, gastosNotariales:54000, escrituracion:18000,
    impuestoAdquisicion:36000, otrosGastos:15000,
    fechaCompra:'2020-06-01', plusvaliaAnual:4.5,
    saldoHipoteca:0, rentaMensual:15000,
  },
  {
    id:4, nombre:'Terreno El Marqués', tipo:'Terreno', ubicacion:'Querétaro – El Marqués',
    precioCompra:850000, gastosNotariales:25500, escrituracion:8500,
    impuestoAdquisicion:17000, otrosGastos:8000,
    fechaCompra:'2022-09-01', plusvaliaAnual:8.0,
    saldoHipoteca:0, rentaMensual:0,
  },
];

// ─── State ────────────────────────────────────────────────────────────────────
let bienes = [];
let bienesLineRangeDays = 7;
let bienesLineChart, bienesDonutChart, bienesBarChart;
let editingBienId = null;
let bienesSortCol = null, bienesSortDir = 1;

// helper: total acquisition costs for a property
function gastosAdqTotal(b) {
  return (b.gastosNotariales || 0) + (b.escrituracion || 0) +
         (b.impuestoAdquisicion || 0) + (b.otrosGastos || 0);
}
function costoTotal(b) { return b.precioCompra + gastosAdqTotal(b); }

// Compute current market value from purchase price + annual appreciation
function computeValorActual(b) {
  if (!b.fechaCompra || !b.plusvaliaAnual) return b.precioCompra;
  const years = (Date.now() - new Date(b.fechaCompra).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  return parseFloat((b.precioCompra * Math.pow(1 + b.plusvaliaAnual / 100, years)).toFixed(0));
}

// Generate appreciation-curve history (days points back from today)
function generateBienesHistory(b, days = 91) {
  if (!b.fechaCompra || !b.plusvaliaAnual) return generateHistory(b.precioCompra, days);
  const today = Date.now();
  const msPerDay = 1000 * 60 * 60 * 24;
  const pts = [];
  for (let i = days - 1; i >= 0; i--) {
    const msAgo = i * msPerDay;
    const years = (today - msAgo - new Date(b.fechaCompra).getTime()) / (msPerDay * 365.25);
    const val = years <= 0 ? b.precioCompra : b.precioCompra * Math.pow(1 + b.plusvaliaAnual / 100, years);
    pts.push(parseFloat(val.toFixed(0)));
  }
  return pts;
}

function persistBienes() { /* no-op — data goes directly to API */ }

// ─── Sort ─────────────────────────────────────────────────────────────────────
function sortBienes(col) {
  bienesSortDir = (bienesSortCol === col) ? -bienesSortDir : 1;
  bienesSortCol = col;
  renderBienesTable(document.querySelector('#table-bienes').closest('.holdings-panel').querySelector('.search-input').value || '');
}

function getBienSortValue(b, col) {
  const ct  = costoTotal(b);
  const val = computeValorActual(b);
  switch (col) {
    case 'nombre':       return b.nombre;
    case 'tipo':         return b.tipo;
    case 'ubicacion':    return b.ubicacion;
    case 'precioCompra': return b.precioCompra;
    case 'gastosAdq':    return gastosAdqTotal(b);
    case 'costoTotal':   return ct;
    case 'valorActual':  return val;
    case 'plusvalia':    return val - ct;
    case 'equityNeto':   return val - (b.saldoHipoteca || 0);
    case 'rentaMensual': return b.rentaMensual || 0;
    default:             return 0;
  }
}

// ─── KPI Rendering ────────────────────────────────────────────────────────────
function renderBienesKPIs() {
  const totalValor    = bienes.reduce((s, b) => s + computeValorActual(b), 0);
  const totalCosto    = bienes.reduce((s, b) => s + costoTotal(b), 0);
  const plusvalia     = totalValor - totalCosto;
  const plusvaliaPct  = totalCosto ? (plusvalia / totalCosto) * 100 : 0;
  const totalRenta    = bienes.reduce((s, b) => s + (b.rentaMensual || 0), 0);

  document.getElementById('br-total-value').textContent  = fmt(totalValor);
  document.getElementById('br-total-change').textContent = fmtPct(plusvaliaPct);
  document.getElementById('br-total-change').className   =
    'kpi__change ' + (plusvaliaPct >= 0 ? 'kpi__change--up' : 'kpi__change--down');

  document.getElementById('br-invested').textContent = fmt(totalCosto);

  const gainEl = document.getElementById('br-gain');
  gainEl.textContent = (plusvalia >= 0 ? '+' : '') + fmt(plusvalia);
  gainEl.className   = 'kpi__value kpi__value--sm ' + (plusvalia >= 0 ? 'kpi__change--up' : 'kpi__change--down');
  document.getElementById('br-gain-pct').textContent = fmtPct(plusvaliaPct);

  document.getElementById('br-renta').textContent = fmt(totalRenta);

  renderSummaryStrip();
}

// ─── Table Rendering ──────────────────────────────────────────────────────────
function renderBienesTable(filter = '') {
  const tbody = document.getElementById('body-bienes');
  const f     = filter.toLowerCase();
  tbody.innerHTML = '';

  let filtered = bienes.filter(b =>
    b.nombre.toLowerCase().includes(f) ||
    b.tipo.toLowerCase().includes(f) ||
    b.ubicacion.toLowerCase().includes(f)
  );

  if (bienesSortCol) {
    filtered.sort((a, b) => {
      const va = getBienSortValue(a, bienesSortCol);
      const vb = getBienSortValue(b, bienesSortCol);
      return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * bienesSortDir;
    });
  }

  document.querySelectorAll('#table-bienes .th-sort').forEach(th => {
    const icon = th.querySelector('.sort-icon');
    if (th.dataset.col === bienesSortCol) {
      icon.textContent = bienesSortDir === 1 ? '↑' : '↓';
      th.classList.add('th-sort--active');
    } else {
      icon.textContent = '↕';
      th.classList.remove('th-sort--active');
    }
  });

  document.getElementById('bienes-count').textContent =
    `${bienes.length} propiedad${bienes.length !== 1 ? 'es' : ''}`;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="14" class="table__empty">Sin propiedades aún — agrega la primera.</td></tr>`;
    return;
  }

  filtered.forEach(b => {
    const color      = bienColor(b.tipo);
    const ct         = costoTotal(b);
    const gastosAdq  = gastosAdqTotal(b);
    const valorActual = computeValorActual(b);
    const plusvalia  = valorActual - ct;
    const equity     = valorActual - (b.saldoHipoteca || 0);
    const up         = plusvalia >= 0;
    const pctAnual   = b.plusvaliaAnual ? b.plusvaliaAnual.toFixed(1) + '%/yr' : '—';

    const tr = document.createElement('tr');
    tr.className = 'table-row';
    tr.innerHTML = `
      <td><span class="s-indicator" style="background:${color};box-shadow:0 0 6px ${color}66"></span></td>
      <td class="s-td-company">${b.nombre}</td>
      <td class="td--ticker" style="color:${color}">${b.tipo}</td>
      <td>${b.ubicacion}</td>
      <td>${fmt(b.precioCompra)}</td>
      <td class="td--muted">${fmt(gastosAdq)}</td>
      <td>${fmt(ct)}</td>
      <td class="td--price">${fmt(valorActual)}</td>
      <td class="${up ? 'td--up' : 'td--down'}">${(up ? '+' : '') + fmt(plusvalia)}</td>
      <td>${fmt(equity)}</td>
      <td style="color:var(--text-secondary)">${pctAnual}</td>
      <td>${b.rentaMensual ? fmt(b.rentaMensual) : '<span style="color:var(--text-tertiary)">—</span>'}</td>
      <td>
        <div class="s-row-actions">
          <button class="s-btn-edit" onclick="openBienesModal('${b.id}')" title="Editar">✎</button>
          <button class="btn-remove" onclick="removeBien('${b.id}')" title="Eliminar">✕</button>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });
}

function filterBienesTable(v) { renderBienesTable(v); }

// ─── Charts ───────────────────────────────────────────────────────────────────
function getBienesPortfolioHistory(n) {
  const total = bienes.reduce((s, b) => s + computeValorActual(b), 0);
  const fake  = _genFake('bienes', total);
  return fake ? fake.slice(-n) : Array(n).fill(0);
}

function initBienesCharts() {
  const pts    = getBienesPortfolioHistory(bienesLineRangeDays);
  const dates  = getDateLabels(bienesLineRangeDays);
  const lineUp = pts[pts.length - 1] >= pts[0];
  const lc     = lineUp ? '#6366f1' : '#f87171';

  // Line chart
  bienesLineChart = new Chart(document.getElementById('chart-bienes-line'), {
    type: 'line',
    data: {
      labels: dates,
      datasets: [{
        data: pts, borderColor: lc, borderWidth: 2, fill: true,
        backgroundColor(ctx) {
          const { chart } = ctx; const { ctx: c, chartArea } = chart;
          if (!chartArea) return 'transparent';
          const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          g.addColorStop(0, lineUp ? 'rgba(99,102,241,0.22)' : 'rgba(248,113,113,0.22)');
          g.addColorStop(1, 'rgba(0,0,0,0)'); return g;
        },
        tension: 0.45, pointRadius: 0, pointHoverRadius: 5,
        pointHoverBackgroundColor: lc, pointHoverBorderColor: '#111525', pointHoverBorderWidth: 2,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor:'#111525', borderColor:'#1e2640', borderWidth:1, titleColor:'#8892a4', bodyColor:'#eef0ff', padding:10, callbacks:{ label: ctx => '  ' + fmt(ctx.raw) } }
      },
      scales: {
        x: { grid:{ color:'#1e2640', tickLength:0 }, ticks:{ maxTicksLimit:7, color:'#3d4a63', padding:6 }, border:{ color:'#1e2640' } },
        y: { position:'right', grid:{ color:'#1a2138', tickLength:0 }, ticks:{ color:'#3d4a63', padding:8, callback: v => '$'+(v>=1000000?(v/1000000).toFixed(1)+'M':v>=1000?(v/1000).toFixed(0)+'k':v.toFixed(0)) }, border:{ color:'transparent' } }
      }
    }
  });

  // Donut — distribution by tipo
  const grouped = {};
  bienes.forEach(b => { grouped[b.tipo] = (grouped[b.tipo] || 0) + computeValorActual(b); });
  const dLabels = Object.keys(grouped);
  bienesDonutChart = new Chart(document.getElementById('chart-bienes-donut'), {
    type: 'doughnut',
    data: {
      labels: dLabels,
      datasets: [{ data: dLabels.map(k => parseFloat(grouped[k].toFixed(2))), backgroundColor: dLabels.map(bienColor), borderColor:'#111525', borderWidth:3, hoverOffset:10 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout:'68%',
      plugins: {
        legend: { position:'right', labels:{ color:'#8892a4', boxWidth:9, boxHeight:9, borderRadius:99, usePointStyle:true, pointStyle:'circle', padding:14, font:{ size:11 } } },
        tooltip: { backgroundColor:'#111525', borderColor:'#1e2640', borderWidth:1, padding:10, callbacks:{ label(ctx){ const total=ctx.dataset.data.reduce((a,b)=>a+b,0); const pct=((ctx.raw/total)*100).toFixed(1); return `  ${ctx.label}:  ${fmt(ctx.raw)}  (${pct}%)`; } } }
      }
    }
  });

  // Bar — plusvalía per property
  bienesBarChart = new Chart(document.getElementById('chart-bienes-bar'), {
    type: 'bar',
    data: {
      labels: bienes.map(b => b.nombre.length > 18 ? b.nombre.slice(0, 16) + '…' : b.nombre),
      datasets: [{
        label: 'Plusvalía',
        data: bienes.map(b => parseFloat((computeValorActual(b) - costoTotal(b)).toFixed(2))),
        backgroundColor: bienes.map(b => {
          const up = computeValorActual(b) - costoTotal(b) >= 0;
          return up ? 'rgba(99,102,241,0.75)' : 'rgba(248,113,113,0.75)';
        }),
        borderColor: bienes.map(b => {
          const up = computeValorActual(b) - costoTotal(b) >= 0;
          return up ? '#6366f1' : '#f87171';
        }),
        borderWidth: 1, borderRadius: 5, borderSkipped: false,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor:'#111525', borderColor:'#1e2640', borderWidth:1, padding:10, callbacks:{ label: ctx => '  ' + (ctx.raw >= 0 ? '+' : '') + fmt(ctx.raw) } }
      },
      scales: {
        x: { grid:{ color:'#1e2640', tickLength:0 }, ticks:{ color:'#3d4a63', padding:6 }, border:{ color:'#1e2640' } },
        y: { position:'right', grid:{ color:'#1a2138', tickLength:0 }, ticks:{ color:'#3d4a63', padding:8, callback: v => '$'+(v>=1000000?(v/1000000).toFixed(1)+'M':v>=1000?(v/1000).toFixed(0)+'k':v.toFixed(0)) }, border:{ color:'transparent' } }
      }
    }
  });
}

function updateBienesCharts() {
  if (!bienesLineChart) return;
  const pts    = getBienesPortfolioHistory(bienesLineRangeDays);
  const dates  = getDateLabels(bienesLineRangeDays);
  const lineUp = pts[pts.length - 1] >= pts[0];
  const lc     = lineUp ? '#6366f1' : '#f87171';

  bienesLineChart.data.labels                  = dates;
  bienesLineChart.data.datasets[0].data        = pts;
  bienesLineChart.data.datasets[0].borderColor = lc;
  bienesLineChart.update();

  const grouped = {};
  bienes.forEach(b => { grouped[b.tipo] = (grouped[b.tipo] || 0) + computeValorActual(b); });
  const dLabels = Object.keys(grouped);
  bienesDonutChart.data.labels                         = dLabels;
  bienesDonutChart.data.datasets[0].data               = dLabels.map(k => parseFloat(grouped[k].toFixed(2)));
  bienesDonutChart.data.datasets[0].backgroundColor    = dLabels.map(bienColor);
  bienesDonutChart.update();

  bienesBarChart.data.labels = bienes.map(b => b.nombre.length > 18 ? b.nombre.slice(0, 16) + '…' : b.nombre);
  bienesBarChart.data.datasets[0].data = bienes.map(b => parseFloat((computeValorActual(b) - costoTotal(b)).toFixed(2)));
  bienesBarChart.data.datasets[0].backgroundColor = bienes.map(b => {
    const up = computeValorActual(b) - costoTotal(b) >= 0;
    return up ? 'rgba(99,102,241,0.75)' : 'rgba(248,113,113,0.75)';
  });
  bienesBarChart.data.datasets[0].borderColor = bienes.map(b => {
    const up = computeValorActual(b) - costoTotal(b) >= 0;
    return up ? '#6366f1' : '#f87171';
  });
  bienesBarChart.update();
}

function setBienesLineRange(days, btn) {
  bienesLineRangeDays = days;
  document.querySelectorAll('#bienes-line-range .tab').forEach(t => t.classList.remove('tab--active'));
  btn.classList.add('tab--active');
  updateBienesCharts();
}

// ─── Add / Edit Modal ─────────────────────────────────────────────────────────
function openBienesModal(id = null) {
  editingBienId = id;
  document.getElementById('bienes-modal-title').textContent = id ? 'Editar Propiedad' : 'Agregar Propiedad';
  if (id) {
    const b = bienes.find(x => x.id === id);
    if (!b) return;
    document.getElementById('bri-nombre').value        = b.nombre;
    document.getElementById('bri-tipo').value          = b.tipo;
    document.getElementById('bri-ubicacion').value     = b.ubicacion;
    document.getElementById('bri-precio').value        = b.precioCompra;
    document.getElementById('bri-fecha').value         = b.fechaCompra || '';
    document.getElementById('bri-plusvalia').value     = b.plusvaliaAnual || '';
    document.getElementById('bri-notariales').value    = b.gastosNotariales || 0;
    document.getElementById('bri-escrituracion').value = b.escrituracion || 0;
    document.getElementById('bri-isabi').value         = b.impuestoAdquisicion || 0;
    document.getElementById('bri-otros').value         = b.otrosGastos || 0;
    document.getElementById('bri-hipoteca').value      = b.saldoHipoteca || 0;
    document.getElementById('bri-renta').value         = b.rentaMensual || 0;
  } else {
    ['bri-nombre','bri-ubicacion','bri-precio','bri-fecha','bri-plusvalia',
     'bri-notariales','bri-escrituracion','bri-isabi','bri-otros',
     'bri-hipoteca','bri-renta']
      .forEach(fid => { document.getElementById(fid).value = ''; });
    document.getElementById('bri-tipo').value = 'Casa';
  }
  document.getElementById('bienes-modal-overlay').classList.add('modal-overlay--visible');
}

function closeBienesModal(e) {
  if (!e || e.target === document.getElementById('bienes-modal-overlay')) {
    document.getElementById('bienes-modal-overlay').classList.remove('modal-overlay--visible');
    editingBienId = null;
  }
}

async function saveBien() {
  const nombre              = document.getElementById('bri-nombre').value.trim();
  const tipo                = document.getElementById('bri-tipo').value;
  const ubicacion           = document.getElementById('bri-ubicacion').value.trim();
  const precioCompra        = parseFloat(document.getElementById('bri-precio').value);
  const fechaCompra         = document.getElementById('bri-fecha').value || null;
  const plusvaliaAnual      = parseFloat(document.getElementById('bri-plusvalia').value) || 0;
  const gastosNotariales    = parseFloat(document.getElementById('bri-notariales').value) || 0;
  const escrituracion       = parseFloat(document.getElementById('bri-escrituracion').value) || 0;
  const impuestoAdquisicion = parseFloat(document.getElementById('bri-isabi').value) || 0;
  const otrosGastos         = parseFloat(document.getElementById('bri-otros').value) || 0;
  const saldoHipoteca       = parseFloat(document.getElementById('bri-hipoteca').value) || 0;
  const rentaMensual        = parseFloat(document.getElementById('bri-renta').value) || 0;

  if (!nombre || !ubicacion || isNaN(precioCompra)) {
    alert('Por favor completa los campos obligatorios: Nombre, Ubicación y Precio de Compra.');
    return;
  }

  const valorActualComputed = computeValorActual({ precioCompra, fechaCompra, plusvaliaAnual });
  const data = { nombre, tipo, ubicacion, precioCompra, fechaCompra, plusvaliaAnual,
                 valorActual: valorActualComputed,
                 gastosNotariales, escrituracion, impuestoAdquisicion,
                 otrosGastos, saldoHipoteca, rentaMensual };

  const editId = editingBienId;
  let apiAction = 'create', targetId = null, backup = null;

  if (editId) {
    const b = bienes.find(x => x.id === editId);
    backup = { ...b };
    if (b) { Object.assign(b, data); b.history = generateBienesHistory(b); }
    apiAction = 'update'; targetId = editId;
  } else {
    targetId = Date.now();
    const newBien = { id: targetId, ...data };
    newBien.history = generateBienesHistory(newBien);
    bienes.push(newBien);
  }

  logEvent({ type: editId ? 'investment_updated' : 'investment_added', category: 'Investment', icon: '🏠', title: `${editId ? 'Updated' : 'Added'} Propiedad: ${nombre}`, detail: `${tipo} · ${ubicacion} · Plusvalía ${plusvaliaAnual}%/yr`, amount: valorActualComputed });
  renderAllBienes();
  closeBienesModal();

  try {
    const item = bienes.find(x => x.id === targetId);
    if (apiAction === 'create' && item) { const created = await WOS_API.holdings.create('bienes', item); item.id = created.id; }
    else if (apiAction === 'update' && item) { await WOS_API.holdings.update('bienes', targetId, item); }
  } catch (err) {
    if (apiAction === 'create') { bienes = bienes.filter(x => x.id !== targetId); }
    else if (backup) { const idx = bienes.findIndex(x => x.id === targetId); if (idx !== -1) bienes[idx] = backup; }
    renderAllBienes();
    console.error('[WOS] save error:', err); showToast('Save failed: ' + ((err && (err.message || (err.data && err.data.message))) || 'Unknown error'));
  }
}

async function removeBien(id) {
  if (!await confirmDelete('¿Eliminar esta propiedad? Esta acción no se puede deshacer.', 'Eliminar Propiedad')) return;
  const b = bienes.find(x => x.id === id);
  const backup = [...bienes];
  bienes = bienes.filter(x => x.id !== id);
  if (b) logEvent({ type: 'investment_removed', category: 'Investment', icon: '🏠', title: `Removed Propiedad: ${b.nombre}`, detail: `${b.tipo} · ${b.ubicacion}`, amount: computeValorActual(b) });
  renderAllBienes();
  try {
    await WOS_API.holdings.remove('bienes', id);
  } catch (err) {
    bienes = backup;
    renderAllBienes();
    console.error('[WOS] remove error:', err); showToast('Remove failed: ' + ((err && (err.message || (err.data && err.data.message))) || 'Unknown error'));
  }
}

function renderAllBienes() {
  renderBienesKPIs();
  renderBienesTable();
  updateBienesCharts();
}

// ══════════════════════════════════════════════════════════════
//  CRYPTOS DASHBOARD
// ══════════════════════════════════════════════════════════════

// ─── Colour map by symbol ─────────────────────────────────────────────────────
const CRYPTO_COLORS = {
  'BTC': '#f7931a',
  'ETH': '#627eea',
  'SOL': '#9945ff',
  'BNB': '#f3ba2f',
  'ADA': '#0d9488',
  'XRP': '#346aa9',
  'DOGE': '#c2a633',
  'MATIC': '#8247e5',
};
function cryptoColor(symbol) { return CRYPTO_COLORS[symbol.toUpperCase()] || '#06b6d4'; }

// ─── Sample data ──────────────────────────────────────────────────────────────
const SAMPLE_CRYPTO = [
  { id:1, symbol:'BTC',  name:'Bitcoin',  amount:0.45,  avgCost:28500.00, currentPrice:67200.00, fechaCompra:'2023-01-20' },
  { id:2, symbol:'ETH',  name:'Ethereum', amount:3.80,  avgCost:1820.00,  currentPrice:3480.00,  fechaCompra:'2023-03-05' },
  { id:3, symbol:'SOL',  name:'Solana',   amount:25.00, avgCost:62.00,    currentPrice:178.50,   fechaCompra:'2023-10-14' },
  { id:4, symbol:'BNB',  name:'BNB',      amount:8.50,  avgCost:245.00,   currentPrice:580.00,   fechaCompra:'2024-04-08' },
  { id:5, symbol:'ADA',  name:'Cardano',  amount:1500,  avgCost:0.42,     currentPrice:0.61,     fechaCompra:'2024-07-30' },
];

// ─── State ────────────────────────────────────────────────────────────────────
let cryptos = [];
let cryptoLineRangeDays = 7;
let cryptoLineChart, cryptoDonutChart, cryptoBarChart;
let editingCryptoId = null;
let cryptoSortCol = null, cryptoSortDir = 1;

function persistCrypto() { /* no-op — data goes directly to API */ }

// ─── Sort ─────────────────────────────────────────────────────────────────────
function sortCrypto(col) {
  cryptoSortDir = (cryptoSortCol === col) ? -cryptoSortDir : 1;
  cryptoSortCol = col;
  renderCryptoTable(document.querySelector('#table-crypto').closest('.holdings-panel').querySelector('.search-input').value || '');
}

function getCryptoSortValue(c, col) {
  const mv   = c.currentPrice * c.amount;
  const gain = (c.currentPrice - c.avgCost) * c.amount;
  const ret  = c.avgCost ? (c.currentPrice - c.avgCost) / c.avgCost : 0;
  const totalValue = cryptos.reduce((s, x) => s + x.currentPrice * x.amount, 0);
  switch (col) {
    case 'symbol':       return c.symbol;
    case 'name':         return c.name;
    case 'amount':       return c.amount;
    case 'avgCost':      return c.avgCost;
    case 'currentPrice': return c.currentPrice;
    case 'value':        return mv;
    case 'gain':         return gain;
    case 'return':       return ret;
    case 'weight':       return totalValue ? mv / totalValue : 0;
    default:             return 0;
  }
}

// ─── KPI Rendering ────────────────────────────────────────────────────────────
function renderCryptoKPIs() {
  const totalValue    = cryptos.reduce((s, c) => s + c.currentPrice * c.amount, 0);
  const totalInvested = cryptos.reduce((s, c) => s + c.avgCost * c.amount, 0);
  const gain          = totalValue - totalInvested;
  const gainPct       = totalInvested ? (gain / totalInvested) * 100 : 0;
  const cpts        = getCryptoPortfolioHistory(cryptoLineRangeDays);
  const dailyChange = cpts.length >= 2 ? cpts[cpts.length - 1] - cpts[0] : 0;

  document.getElementById('c-total-value').textContent  = fmt(totalValue);
  document.getElementById('c-total-change').textContent = fmtPct(gainPct);
  document.getElementById('c-total-change').className   =
    'kpi__change ' + (gainPct >= 0 ? 'kpi__change--up' : 'kpi__change--down');

  document.getElementById('c-invested').textContent = fmt(totalInvested);

  const gainEl = document.getElementById('c-gain');
  gainEl.textContent = (gain >= 0 ? '+' : '') + fmt(gain);
  gainEl.className   = 'kpi__value kpi__value--sm ' + (gain >= 0 ? 'kpi__change--up' : 'kpi__change--down');
  document.getElementById('c-gain-pct').textContent = fmtPct(gainPct);

  const dailyEl    = document.getElementById('c-daily');
  const dailySubEl = document.getElementById('c-daily-sub');
  dailyEl.textContent = (dailyChange >= 0 ? '+' : '') + fmt(dailyChange);
  dailyEl.className   = 'kpi__value kpi__value--sm ' + (dailyChange >= 0 ? 'kpi__change--up' : 'kpi__change--down');
  if (dailySubEl) dailySubEl.textContent = _rangeSubLabel(cryptoLineRangeDays);

  renderSummaryStrip();
}

// ─── Table Rendering ──────────────────────────────────────────────────────────
function renderCryptoTable(filter = '') {
  const tbody      = document.getElementById('body-crypto');
  const f          = filter.toLowerCase();
  const totalValue = cryptos.reduce((s, c) => s + c.currentPrice * c.amount, 0);
  tbody.innerHTML  = '';

  let filtered = cryptos.filter(c =>
    c.symbol.toLowerCase().includes(f) || c.name.toLowerCase().includes(f)
  );

  if (cryptoSortCol) {
    filtered.sort((a, b) => {
      const va = getCryptoSortValue(a, cryptoSortCol);
      const vb = getCryptoSortValue(b, cryptoSortCol);
      return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * cryptoSortDir;
    });
  }

  document.querySelectorAll('#table-crypto .th-sort').forEach(th => {
    const icon = th.querySelector('.sort-icon');
    if (th.dataset.col === cryptoSortCol) {
      icon.textContent = cryptoSortDir === 1 ? '↑' : '↓';
      th.classList.add('th-sort--active');
    } else {
      icon.textContent = '↕';
      th.classList.remove('th-sort--active');
    }
  });

  document.getElementById('crypto-count').textContent =
    `${cryptos.length} position${cryptos.length !== 1 ? 's' : ''}`;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="11" class="table__empty">No crypto positions yet — add your first.</td></tr>`;
    return;
  }

  filtered.forEach(c => {
    const color  = cryptoColor(c.symbol);
    const mv     = c.currentPrice * c.amount;
    const gain   = (c.currentPrice - c.avgCost) * c.amount;
    const ret    = c.avgCost ? (c.currentPrice - c.avgCost) / c.avgCost * 100 : 0;
    const weight = totalValue ? (mv / totalValue * 100) : 0;
    const up     = gain >= 0;

    // Format amount — show up to 8 decimals, trim trailing zeros
    const amtStr = c.amount < 1
      ? c.amount.toFixed(8).replace(/\.?0+$/, '')
      : c.amount.toLocaleString('en-US', { maximumFractionDigits: 4 });

    const tr = document.createElement('tr');
    tr.className = 'table-row';
    tr.innerHTML = `
      <td><span class="s-indicator" style="background:${color};box-shadow:0 0 6px ${color}66"></span></td>
      <td class="td--ticker" style="color:${color}">${c.symbol}</td>
      <td class="s-td-company">${c.name}</td>
      <td>${amtStr}</td>
      <td>${fmt(c.avgCost)}</td>
      <td class="td--price">${fmt(c.currentPrice)}</td>
      <td>${fmt(mv)}</td>
      <td class="${up ? 'td--up' : 'td--down'}">${(up ? '+' : '') + fmt(gain)}</td>
      <td class="${up ? 'td--up' : 'td--down'}">${fmtPct(ret)}</td>
      <td>${weight.toFixed(1)}%</td>
      <td>
        <div class="s-row-actions">
          <button class="s-btn-edit" onclick="openCryptoModal('${c.id}')" title="Edit">✎</button>
          <button class="btn-remove" onclick="removeCrypto('${c.id}')" title="Remove">✕</button>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });
}

function filterCryptoTable(v) { renderCryptoTable(v); }

// ─── Charts ───────────────────────────────────────────────────────────────────
function getCryptoPortfolioHistory(n) {
  const series = _sliceHistory(_cryptoHistory, n);
  if (series) return series.map(([, v]) => v);
  const total = cryptos.reduce((s, c) => s + c.currentPrice * c.amount, 0);
  const days  = _daysSincePurchase(cryptos, 'purchaseDate');
  const clamp = days ? Math.min(n, days) : n;
  const fake  = _genFake('crypto', total);
  return fake ? fake.slice(-clamp) : Array(clamp).fill(0);
}

function initCryptoCharts() {
  const pts    = getCryptoPortfolioHistory(cryptoLineRangeDays);
  const dates  = getRealDateLabels(_cryptoHistory, cryptoLineRangeDays, _daysSincePurchase(cryptos, 'purchaseDate'));
  const lineUp = pts[pts.length - 1] >= pts[0];
  const lc     = lineUp ? '#f7931a' : '#f87171';

  // Line chart
  cryptoLineChart = new Chart(document.getElementById('chart-crypto-line'), {
    type: 'line',
    data: {
      labels: dates,
      datasets: [{
        data: pts, borderColor: lc, borderWidth: 2, fill: true,
        backgroundColor(ctx) {
          const { chart } = ctx; const { ctx: c, chartArea } = chart;
          if (!chartArea) return 'transparent';
          const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          g.addColorStop(0, lineUp ? 'rgba(247,147,26,0.22)' : 'rgba(248,113,113,0.22)');
          g.addColorStop(1, 'rgba(0,0,0,0)'); return g;
        },
        tension: 0.45, pointRadius: 0, pointHoverRadius: 5,
        pointHoverBackgroundColor: lc, pointHoverBorderColor: '#111525', pointHoverBorderWidth: 2,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor:'#111525', borderColor:'#1e2640', borderWidth:1, titleColor:'#8892a4', bodyColor:'#eef0ff', padding:10, callbacks:{ label: ctx => '  ' + fmt(ctx.raw) } }
      },
      scales: {
        x: { grid:{ color:'#1e2640', tickLength:0 }, ticks:{ maxTicksLimit:7, color:'#3d4a63', padding:6 }, border:{ color:'#1e2640' } },
        y: { position:'right', grid:{ color:'#1a2138', tickLength:0 }, ticks:{ color:'#3d4a63', padding:8, callback: v => '$'+(v>=1000?(v/1000).toFixed(0)+'k':v.toFixed(0)) }, border:{ color:'transparent' } }
      }
    }
  });

  // Donut — allocation by coin
  const dLabels = cryptos.map(c => c.symbol);
  const dData   = cryptos.map(c => parseFloat((c.currentPrice * c.amount).toFixed(2)));
  cryptoDonutChart = new Chart(document.getElementById('chart-crypto-donut'), {
    type: 'doughnut',
    data: {
      labels: dLabels,
      datasets: [{ data: dData, backgroundColor: dLabels.map(cryptoColor), borderColor:'#111525', borderWidth:3, hoverOffset:10 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout:'68%',
      plugins: {
        legend: { position:'right', labels:{ color:'#8892a4', boxWidth:9, boxHeight:9, borderRadius:99, usePointStyle:true, pointStyle:'circle', padding:14, font:{ size:11 } } },
        tooltip: { backgroundColor:'#111525', borderColor:'#1e2640', borderWidth:1, padding:10, callbacks:{ label(ctx){ const total=ctx.dataset.data.reduce((a,b)=>a+b,0); const pct=((ctx.raw/total)*100).toFixed(1); return `  ${ctx.label}:  ${fmt(ctx.raw)}  (${pct}%)`; } } }
      }
    }
  });

  // Bar — gain/loss per coin
  cryptoBarChart = new Chart(document.getElementById('chart-crypto-bar'), {
    type: 'bar',
    data: {
      labels: cryptos.map(c => c.symbol),
      datasets: [{
        label: 'Gain / Loss',
        data: cryptos.map(c => parseFloat(((c.currentPrice - c.avgCost) * c.amount).toFixed(2))),
        backgroundColor: cryptos.map(c => {
          const g = (c.currentPrice - c.avgCost) * c.amount >= 0;
          return g ? 'rgba(52,211,153,0.75)' : 'rgba(248,113,113,0.75)';
        }),
        borderColor: cryptos.map(c => {
          const g = (c.currentPrice - c.avgCost) * c.amount >= 0;
          return g ? '#34d399' : '#f87171';
        }),
        borderWidth: 1, borderRadius: 5, borderSkipped: false,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor:'#111525', borderColor:'#1e2640', borderWidth:1, padding:10, callbacks:{ label: ctx => '  ' + (ctx.raw >= 0 ? '+' : '') + fmt(ctx.raw) } }
      },
      scales: {
        x: { grid:{ color:'#1e2640', tickLength:0 }, ticks:{ color:'#3d4a63', padding:6 }, border:{ color:'#1e2640' } },
        y: { position:'right', grid:{ color:'#1a2138', tickLength:0 }, ticks:{ color:'#3d4a63', padding:8, callback: v => '$'+(v>=1000?(v/1000).toFixed(0)+'k':v.toFixed(0)) }, border:{ color:'transparent' } }
      }
    }
  });
}

function updateCryptoCharts() {
  if (!cryptoLineChart) return;
  const pts    = getCryptoPortfolioHistory(cryptoLineRangeDays);
  const dates  = getRealDateLabels(_cryptoHistory, cryptoLineRangeDays, _daysSincePurchase(cryptos, 'purchaseDate'));
  const lineUp = pts[pts.length - 1] >= pts[0];
  const lc     = lineUp ? '#f7931a' : '#f87171';

  cryptoLineChart.data.labels   = dates;
  cryptoLineChart.data.datasets[0].data        = pts;
  cryptoLineChart.data.datasets[0].borderColor = lc;
  cryptoLineChart.update();

  const dLabels = cryptos.map(c => c.symbol);
  const dData   = cryptos.map(c => parseFloat((c.currentPrice * c.amount).toFixed(2)));
  cryptoDonutChart.data.labels                  = dLabels;
  cryptoDonutChart.data.datasets[0].data        = dData;
  cryptoDonutChart.data.datasets[0].backgroundColor = dLabels.map(cryptoColor);
  cryptoDonutChart.update();

  cryptoBarChart.data.labels = cryptos.map(c => c.symbol);
  cryptoBarChart.data.datasets[0].data = cryptos.map(c => parseFloat(((c.currentPrice - c.avgCost) * c.amount).toFixed(2)));
  cryptoBarChart.data.datasets[0].backgroundColor = cryptos.map(c => {
    const g = (c.currentPrice - c.avgCost) * c.amount >= 0;
    return g ? 'rgba(52,211,153,0.75)' : 'rgba(248,113,113,0.75)';
  });
  cryptoBarChart.data.datasets[0].borderColor = cryptos.map(c => {
    const g = (c.currentPrice - c.avgCost) * c.amount >= 0;
    return g ? '#34d399' : '#f87171';
  });
  cryptoBarChart.update();
}

function setCryptoLineRange(days, btn) {
  cryptoLineRangeDays = days;
  document.querySelectorAll('#crypto-line-range .tab').forEach(t => t.classList.remove('tab--active'));
  btn.classList.add('tab--active');
  updateCryptoCharts();
  renderCryptoKPIs();
}

// ─── Add / Edit Modal ─────────────────────────────────────────────────────────
function openCryptoModal(id = null) {
  editingCryptoId = id;
  document.getElementById('crypto-modal-title').textContent = id ? 'Edit Coin' : 'Add Coin';
  if (id) {
    const c = cryptos.find(x => x.id === id);
    if (!c) return;
    document.getElementById('ci-symbol').value = c.symbol;
    document.getElementById('ci-name').value   = c.name;
    document.getElementById('ci-amount').value = c.amount;
    document.getElementById('ci-cost').value   = c.avgCost;
    document.getElementById('ci-price').value  = c.currentPrice;
    document.getElementById('ci-fecha').value  = c.fechaCompra || '';
  } else {
    ['ci-symbol','ci-name','ci-amount','ci-cost','ci-price','ci-fecha']
      .forEach(fid => { document.getElementById(fid).value = ''; });
  }
  document.getElementById('crypto-modal-overlay').classList.add('modal-overlay--visible');
}

function closeCryptoModal(e) {
  if (!e || e.target === document.getElementById('crypto-modal-overlay')) {
    document.getElementById('crypto-modal-overlay').classList.remove('modal-overlay--visible');
    editingCryptoId = null;
  }
}

async function saveCrypto() {
  const symbol       = document.getElementById('ci-symbol').value.trim().toUpperCase();
  const name         = document.getElementById('ci-name').value.trim();
  const amount       = parseFloat(document.getElementById('ci-amount').value);
  const avgCost      = parseFloat(document.getElementById('ci-cost').value);
  const currentPrice = parseFloat(document.getElementById('ci-price').value);
  const fechaCompra  = document.getElementById('ci-fecha').value || null;

  if (!symbol || !name || isNaN(amount) || isNaN(avgCost) || isNaN(currentPrice)) {
    alert('Please fill in all required fields.');
    return;
  }

  const editId = editingCryptoId;
  let apiAction = 'create', targetId = null, backup = null;

  if (editId) {
    const c = cryptos.find(x => x.id === editId);
    backup = { ...c };
    if (c) Object.assign(c, { symbol, name, amount, avgCost, currentPrice, fechaCompra });
    apiAction = 'update'; targetId = editId;
  } else {
    targetId = Date.now();
    cryptos.push({ id: targetId, symbol, name, amount, avgCost, currentPrice, fechaCompra, history: generateHistory(currentPrice * amount) });
  }

  logEvent({ type: editId ? 'investment_updated' : 'investment_added', category: 'Investment', icon: '🪙', title: `${editId ? 'Updated' : 'Added'} Crypto: ${symbol}`, detail: `${amount} tokens @ $${avgCost} avg cost · ${name}`, amount: currentPrice * amount });
  renderAllCrypto();
  closeCryptoModal();

  try {
    const item = cryptos.find(x => x.id === targetId);
    if (apiAction === 'create' && item) { const created = await WOS_API.holdings.create('crypto', item); item.id = created.id; }
    else if (apiAction === 'update' && item) { await WOS_API.holdings.update('crypto', targetId, item); }
  } catch (err) {
    if (apiAction === 'create') { cryptos = cryptos.filter(x => x.id !== targetId); }
    else if (backup) { const idx = cryptos.findIndex(x => x.id === targetId); if (idx !== -1) cryptos[idx] = backup; }
    renderAllCrypto();
    console.error('[WOS] save error:', err); showToast('Save failed: ' + ((err && (err.message || (err.data && err.data.message))) || 'Unknown error'));
  }
}

async function removeCrypto(id) {
  if (!await confirmDelete('¿Eliminar esta posición? Esta acción no se puede deshacer.', 'Eliminar Crypto')) return;
  const c = cryptos.find(x => x.id === id);
  const backup = [...cryptos];
  cryptos = cryptos.filter(x => x.id !== id);
  if (c) logEvent({ type: 'investment_removed', category: 'Investment', icon: '🪙', title: `Removed Crypto: ${c.symbol}`, detail: `${c.amount} tokens · ${c.name}`, amount: c.currentPrice * c.amount });
  renderAllCrypto();
  try {
    await WOS_API.holdings.remove('crypto', id);
  } catch (err) {
    cryptos = backup;
    renderAllCrypto();
    console.error('[WOS] remove error:', err); showToast('Remove failed: ' + ((err && (err.message || (err.data && err.data.message))) || 'Unknown error'));
  }
}

function renderAllCrypto() {
  renderCryptoKPIs();
  renderCryptoTable();
  updateCryptoCharts();
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function initHoldings() {
  // Render empty state immediately so the page isn't blank
  renderAll();
  renderAllBonos();
  renderAllFondos();
  renderAllFibras();
  renderAllRetiro();
  renderAllCrypto();
  renderAllBienes();
  initCharts();

  try {
    const [s, b, f, fb, r, c, bi] = await Promise.all([
      WOS_API.holdings.list('stocks'),
      WOS_API.holdings.list('bonos'),
      WOS_API.holdings.list('fondos'),
      WOS_API.holdings.list('fibras'),
      WOS_API.holdings.list('retiro'),
      WOS_API.holdings.list('crypto'),
      WOS_API.holdings.list('bienes'),
    ]);
    stocks = s; bonos = b; fondos = f; fibras = fb; retiro = r; cryptos = c; bienes = bi;
  } catch (err) {
    // arrays remain empty — show empty state
  }

  renderAll();
  renderAllBonos();
  renderAllFondos();
  renderAllFibras();
  renderAllRetiro();
  renderAllCrypto();
  renderAllBienes();

  // Fetch real historical price data from asset_snapshots and refresh charts.
  // Uses .catch() so any failure is silent — charts keep showing fake data.
  _showChartLoading();
  loadRealHistory().then(() => {
    updateCharts();        // stocks — safe no-op if chart not yet initialised
    updateCryptoCharts();  // crypto — safe no-op if chart not yet initialised
    updateFibrasCharts();  // fibras — safe no-op if chart not yet initialised
  }).catch(() => {}).finally(() => {
    _hideChartLoading();
  });
}

initHoldings();

// ─── Stock modal: auto-trigger lookup when both Ticker + Date are filled ──────
// Only fires in add mode (editingStockId === null). Edit mode uses the
// "Refresh Prices" button instead to avoid overwriting intentional values.
(function () {
  const tickerEl = document.getElementById('si-ticker');
  const fechaEl  = document.getElementById('si-fecha');
  if (!tickerEl || !fechaEl) return;

  tickerEl.addEventListener('blur', () => {
    if (!editingStockId && tickerEl.value.trim() && fechaEl.value) {
      lookupStockTicker();
    }
  });

  fechaEl.addEventListener('change', () => {
    if (!editingStockId && tickerEl.value.trim() && fechaEl.value) {
      lookupStockTicker();
    }
  });
})();

window.addEventListener('resize', () => {
  if (lineChart) lineChart.resize();
  if (donutChart) donutChart.resize();
  if (barChart) barChart.resize();
  if (bonosLineChart) bonosLineChart.resize();
  if (bonosDonutChart) bonosDonutChart.resize();
  if (bonosBarChart) bonosBarChart.resize();
  if (fondosLineChart) fondosLineChart.resize();
  if (fondosDonutChart) fondosDonutChart.resize();
  if (fondosBarChart) fondosBarChart.resize();
  if (fibrasLineChart) fibrasLineChart.resize();
  if (fibrasDonutChart) fibrasDonutChart.resize();
  if (fibrasBarChart) fibrasBarChart.resize();
  if (retiroLineChart) retiroLineChart.resize();
  if (retiroDonutChart) retiroDonutChart.resize();
  if (retiroBarChart) retiroBarChart.resize();
  if (cryptoLineChart) cryptoLineChart.resize();
  if (cryptoDonutChart) cryptoDonutChart.resize();
  if (cryptoBarChart) cryptoBarChart.resize();
  if (bienesLineChart) bienesLineChart.resize();
  if (bienesDonutChart) bienesDonutChart.resize();
  if (bienesBarChart) bienesBarChart.resize();
});

// ─── Deep-link via hash (e.g. holdings.html#crypto) ──────────────────────────
(function () {
  const tab = location.hash.replace('#', '');
  if (tab) {
    const btn = document.querySelector(`.cat-tab[data-tab="${tab}"]`);
    if (btn) switchTab(tab, btn);
  }
})();
