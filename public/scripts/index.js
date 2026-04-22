// ─── Tracking ─────────────────────────────────────────────────────────────────
function setVisitorCount(){
  const visits = Number(localStorage.getItem('folio-visit-count') || '0') + 1;
  localStorage.setItem('folio-visit-count', visits);
}

// ─── Portfolio cache (populated from API on load) ─────────────────────────────
let _wosRaw = { stocks: [], bonos: [], fondos: [], fibras: [], retiro: [], crypto: [], bienes: [] };
let _cashTotal = 0;

// Real portfolio history from /api/portfolio/history — [{date, total_value}] or null
let _portfolioHistoryData = null;

async function refreshPortfolioHistory() {
  const d = new Date();
  d.setDate(d.getDate() - 365);
  const from = d.toISOString().slice(0, 10);
  const to   = new Date().toISOString().slice(0, 10);
  try {
    _portfolioHistoryData = await WOS_API.portfolio.history(from, to);
  } catch (_) {
    _portfolioHistoryData = null;
  }
}

async function refreshPortfolio() {
  const [stocks, bonos, fondos, fibras, retiro, crypto, bienes, accts] = await Promise.all([
    WOS_API.holdings.list('stocks'),
    WOS_API.holdings.list('bonos'),
    WOS_API.holdings.list('fondos'),
    WOS_API.holdings.list('fibras'),
    WOS_API.holdings.list('retiro'),
    WOS_API.holdings.list('crypto'),
    WOS_API.holdings.list('bienes'),
    WOS_API.accounts.list(),
  ]);
  _wosRaw   = { stocks, bonos, fondos, fibras, retiro, crypto, bienes };
  _cashTotal = accts.reduce((s, a) => s + (a.balanceMXN || 0), 0);
}

// Legacy — no longer used for data, kept to avoid reference errors
let holdings = [];

const COLORS = [
  '#6366f1','#34d399','#f87171','#fbbf24','#8b5cf6','#06b6d4','#ec4899','#a3e635'
];

// ─── Date ────────────────────────────────────────────────────────────────────
document.getElementById('current-date').textContent =
  new Date().toLocaleDateString(window.WOS_LOCALE || 'en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});

// ─── Modal ───────────────────────────────────────────────────────────────────
function openModal(){
  resetModal();
  document.getElementById('modal-overlay').classList.add('modal-overlay--visible');
}
function closeModal(e){
  if(!e || e.target === document.getElementById('modal-overlay') || !e.target.closest){
    document.getElementById('modal-overlay').classList.remove('modal-overlay--visible');
    resetModal();
  }
}
function resetModal(){
  const typeEl = document.getElementById('m-asset-type');
  if(typeEl) typeEl.value = '';
  document.querySelectorAll('.asset-fields').forEach(el => el.style.display = 'none');
  const actionsEl = document.getElementById('modal-actions');
  if(actionsEl) actionsEl.style.display = 'none';
  document.querySelectorAll('#modal-overlay input').forEach(el => el.value = '');
  document.querySelectorAll('#modal-overlay select').forEach(el => el.selectedIndex = 0);
}
function onAssetTypeChange(val){
  document.querySelectorAll('.asset-fields').forEach(el => el.style.display = 'none');
  document.getElementById('modal-actions').style.display = 'none';
  if(!val) return;
  const section = document.getElementById('fields-' + val);
  if(section){
    section.style.display = 'flex';
    section.style.flexDirection = 'column';
    section.style.gap = '16px';
    document.getElementById('modal-actions').style.display = 'flex';
  }
}

// ─── Add Asset (routes to the right API category) ────────────────────────────
function addAsset(){
  const type = document.getElementById('m-asset-type').value;
  const handlers = {
    stocks: addAsset_stocks,
    bonos:  addAsset_bonos,
    fondos: addAsset_fondos,
    fibras: addAsset_fibras,
    retiro: addAsset_retiro,
    crypto: addAsset_crypto,
    bienes: addAsset_bienes,
  };
  if(handlers[type]) handlers[type]();
}

// Helper: optimistic add to cache → close modal → render → POST to API
async function _apiAdd(cat, data, cacheKey, logPayload) {
  const tempId = Date.now();
  _wosRaw[cacheKey].push({ id: tempId, ...data, history: generateHistory(data._chartVal || 0) });
  delete _wosRaw[cacheKey][_wosRaw[cacheKey].length - 1].history; // remove temp chart val
  closeModal(); render();
  try {
    const created = await WOS_API.holdings.create(cat, data);
    const idx = _wosRaw[cacheKey].findIndex(x => x.id === tempId);
    if (idx !== -1) _wosRaw[cacheKey][idx] = created;
    logEvent(logPayload);
  } catch(_) {
    _wosRaw[cacheKey] = _wosRaw[cacheKey].filter(x => x.id !== tempId);
    render();
    showToast('Failed to save. Please try again.', 'error');
  }
}

async function addAsset_stocks(){
  const ticker = document.getElementById('m-s-ticker').value.trim().toUpperCase();
  const name   = document.getElementById('m-s-name').value.trim();
  const shares = parseFloat(document.getElementById('m-s-shares').value);
  const cost   = parseFloat(document.getElementById('m-s-cost').value);
  const price  = parseFloat(document.getElementById('m-s-price').value);
  if(!ticker || !name || isNaN(shares) || isNaN(cost) || isNaN(price)){
    alert('Please fill in all fields.'); return;
  }
  closeModal();
  try {
    const created = await WOS_API.holdings.create('stocks', { ticker, name, shares, avgCost: cost, currentPrice: price });
    _wosRaw.stocks.push(created);
    render();
    logEvent({ type: 'investment_added', category: 'Investment', icon: '📈', title: `Added Stock: ${ticker}`, detail: `${shares} shares @ $${cost} · ${name}`, amount: shares * price });
  } catch(_) { showToast('Failed to save. Please try again.', 'error'); }
}

async function addAsset_bonos(){
  const instrumento  = document.getElementById('m-b-instrumento').value;
  const serie        = document.getElementById('m-b-serie').value.trim().toUpperCase();
  const titulos      = parseInt(document.getElementById('m-b-titulos').value);
  const valorNominal = parseFloat(document.getElementById('m-b-nominal').value);
  const precioCompra = parseFloat(document.getElementById('m-b-compra').value);
  const precioActual = parseFloat(document.getElementById('m-b-actual').value);
  const tasaCupon    = parseFloat(document.getElementById('m-b-cupon').value) || 0;
  const rendimiento  = parseFloat(document.getElementById('m-b-rendimiento').value);
  const vencimiento  = document.getElementById('m-b-vencimiento').value;
  if(!serie || isNaN(titulos) || isNaN(valorNominal) || isNaN(precioCompra) || isNaN(precioActual) || isNaN(rendimiento) || !vencimiento){
    alert('Por favor completa todos los campos.'); return;
  }
  closeModal();
  try {
    const created = await WOS_API.holdings.create('bonos', { instrumento, serie, titulos, valorNominal, precioCompra, precioActual, tasaCupon, rendimiento, vencimiento });
    _wosRaw.bonos.push(created);
    render();
    logEvent({ type: 'investment_added', category: 'Investment', icon: '🏛️', title: `Added Bono: ${instrumento} ${serie}`, detail: `${titulos} títulos @ $${precioCompra} · Vence ${vencimiento}`, amount: precioActual * titulos });
  } catch(_) { showToast('Failed to save. Please try again.', 'error'); }
}

async function addAsset_fondos(){
  const clave        = document.getElementById('m-f-clave').value.trim().toUpperCase();
  const nombre       = document.getElementById('m-f-nombre').value.trim();
  const operadora    = document.getElementById('m-f-operadora').value.trim();
  const tipo         = document.getElementById('m-f-tipo').value;
  const unidades     = parseFloat(document.getElementById('m-f-unidades').value);
  const precioCompra = parseFloat(document.getElementById('m-f-compra').value);
  const navActual    = parseFloat(document.getElementById('m-f-nav').value);
  const rendimiento  = parseFloat(document.getElementById('m-f-rendimiento').value);
  if(!clave || !nombre || !operadora || isNaN(unidades) || isNaN(precioCompra) || isNaN(navActual) || isNaN(rendimiento)){
    alert('Por favor completa todos los campos.'); return;
  }
  closeModal();
  try {
    const created = await WOS_API.holdings.create('fondos', { clave, nombre, operadora, tipo, unidades, precioCompra, navActual, rendimiento });
    _wosRaw.fondos.push(created);
    render();
    logEvent({ type: 'investment_added', category: 'Investment', icon: '📊', title: `Added Fondo: ${clave}`, detail: `${unidades} unidades · ${nombre} (${operadora})`, amount: navActual * unidades });
  } catch(_) { showToast('Failed to save. Please try again.', 'error'); }
}

async function addAsset_fibras(){
  const ticker       = document.getElementById('m-fb-ticker').value.trim().toUpperCase();
  const nombre       = document.getElementById('m-fb-nombre').value.trim();
  const sector       = document.getElementById('m-fb-sector').value;
  const certificados = parseInt(document.getElementById('m-fb-certificados').value);
  const precioCompra = parseFloat(document.getElementById('m-fb-compra').value);
  const precioActual = parseFloat(document.getElementById('m-fb-actual').value);
  const distribucion = parseFloat(document.getElementById('m-fb-distribucion').value);
  const rendimiento  = parseFloat(document.getElementById('m-fb-rendimiento').value);
  if(!ticker || !nombre || isNaN(certificados) || isNaN(precioCompra) || isNaN(precioActual) || isNaN(distribucion) || isNaN(rendimiento)){
    alert('Por favor completa todos los campos.'); return;
  }
  closeModal();
  try {
    const created = await WOS_API.holdings.create('fibras', { ticker, nombre, sector, certificados, precioCompra, precioActual, distribucion, rendimiento });
    _wosRaw.fibras.push(created);
    render();
    logEvent({ type: 'investment_added', category: 'Investment', icon: '🏢', title: `Added Fibra: ${ticker}`, detail: `${certificados} certificados @ $${precioCompra} · ${nombre}`, amount: precioActual * certificados });
  } catch(_) { showToast('Failed to save. Please try again.', 'error'); }
}

async function addAsset_retiro(){
  const tipo               = document.getElementById('m-r-tipo').value;
  const nombre             = document.getElementById('m-r-nombre').value.trim();
  const institucion        = document.getElementById('m-r-institucion').value.trim();
  const subcuenta          = document.getElementById('m-r-subcuenta').value;
  const saldo              = parseFloat(document.getElementById('m-r-saldo').value);
  const aportacionYTD      = parseFloat(document.getElementById('m-r-aportacion').value) || 0;
  const aportacionPatronal = parseFloat(document.getElementById('m-r-patronal').value) || 0;
  const rendimiento        = parseFloat(document.getElementById('m-r-rendimiento').value);
  const proyeccion         = parseFloat(document.getElementById('m-r-proyeccion').value) || 0;
  if(!nombre || !institucion || isNaN(saldo) || isNaN(rendimiento)){
    alert('Por favor completa los campos obligatorios.'); return;
  }
  closeModal();
  try {
    const created = await WOS_API.holdings.create('retiro', { tipo, nombre, institucion, subcuenta, saldo, aportacionYTD, aportacionPatronal, rendimiento, proyeccion });
    _wosRaw.retiro.push(created);
    render();
    logEvent({ type: 'investment_added', category: 'Investment', icon: '🏦', title: `Added Retiro: ${nombre}`, detail: `Saldo $${saldo.toLocaleString()} · ${tipo} (${institucion})`, amount: saldo });
  } catch(_) { showToast('Failed to save. Please try again.', 'error'); }
}

async function addAsset_crypto(){
  const symbol       = document.getElementById('m-c-symbol').value.trim().toUpperCase();
  const name         = document.getElementById('m-c-name').value.trim();
  const amount       = parseFloat(document.getElementById('m-c-amount').value);
  const avgCost      = parseFloat(document.getElementById('m-c-cost').value);
  const currentPrice = parseFloat(document.getElementById('m-c-price').value);
  if(!symbol || !name || isNaN(amount) || isNaN(avgCost) || isNaN(currentPrice)){
    alert('Please fill in all required fields.'); return;
  }
  closeModal();
  try {
    const created = await WOS_API.holdings.create('crypto', { symbol, name, amount, avgCost, currentPrice });
    _wosRaw.crypto.push(created);
    render();
    logEvent({ type: 'investment_added', category: 'Investment', icon: '🪙', title: `Added Crypto: ${symbol}`, detail: `${amount} tokens @ $${avgCost} · ${name}`, amount: currentPrice * amount });
  } catch(_) { showToast('Failed to save. Please try again.', 'error'); }
}

async function addAsset_bienes(){
  const nombre              = document.getElementById('m-br-nombre').value.trim();
  const tipo                = document.getElementById('m-br-tipo').value;
  const ubicacion           = document.getElementById('m-br-ubicacion').value.trim();
  const precioCompra        = parseFloat(document.getElementById('m-br-precio').value);
  const valorActual         = parseFloat(document.getElementById('m-br-valor').value);
  const gastosNotariales    = parseFloat(document.getElementById('m-br-notariales').value) || 0;
  const escrituracion       = parseFloat(document.getElementById('m-br-escrituracion').value) || 0;
  const impuestoAdquisicion = parseFloat(document.getElementById('m-br-isabi').value) || 0;
  const otrosGastos         = parseFloat(document.getElementById('m-br-otros').value) || 0;
  const saldoHipoteca       = parseFloat(document.getElementById('m-br-hipoteca').value) || 0;
  const rentaMensual        = parseFloat(document.getElementById('m-br-renta').value) || 0;
  if(!nombre || !ubicacion || isNaN(precioCompra) || isNaN(valorActual)){
    alert('Por favor completa: Nombre, Ubicación, Precio de Compra y Valor Actual.'); return;
  }
  closeModal();
  try {
    const created = await WOS_API.holdings.create('bienes', { nombre, tipo, ubicacion, precioCompra, plusvaliaAnual: 0, gastosNotariales, escrituracion, impuestoAdquisicion, otrosGastos, saldoHipoteca, rentaMensual });
    _wosRaw.bienes.push(created);
    render();
    logEvent({ type: 'investment_added', category: 'Investment', icon: '🏠', title: `Added Propiedad: ${nombre}`, detail: `${tipo} · ${ubicacion} · Valor $${valorActual.toLocaleString()}`, amount: valorActual });
  } catch(_) { showToast('Failed to save. Please try again.', 'error'); }
}

function generateHistory(price){
  const pts = [];
  let p = price * (0.75 + Math.random()*0.3);
  for(let i=0;i<90;i++){
    p = p * (1 + (Math.random()-0.48)*0.025);
    pts.push(parseFloat(p.toFixed(2)));
  }
  pts.push(price);
  return pts;
}

function removeAsset(id){
  holdings = holdings.filter(h => h.id !== id);
  save();
  render();
}

function save(){
  localStorage.setItem('folio-holdings', JSON.stringify(holdings));
}

// ─── Render ──────────────────────────────────────────────────────────────────
function fmt(n){ return '$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtPct(n){ return (n>=0?'+':'')+n.toFixed(2)+'%'; }

function render(){
  renderKPIs();
  renderTable();
  renderDonut();
  renderLine(currentRange);
}

function renderKPIs() {
  const { totalValue: investmentValue, totalInvested, dailyChange } = loadWosPortfolio();
  const cashTotal  = _cashTotal;
  const totalValue = investmentValue + cashTotal;
  const pnl    = totalValue - totalInvested;
  const pnlPct = totalInvested ? (pnl / totalInvested) * 100 : 0;

  document.getElementById('total-value').textContent    = fmt(totalValue);
  document.getElementById('total-change').textContent   = fmtPct(pnlPct);
  document.getElementById('total-change').className     = 'kpi__change ' + (pnlPct >= 0 ? 'kpi__change--up' : 'kpi__change--down');
  document.getElementById('total-invested').textContent = fmt(investmentValue);
  document.getElementById('total-liquid').textContent   = fmt(cashTotal);
  document.getElementById('unrealized-pnl').textContent = (pnl >= 0 ? '+' : '') + fmt(pnl);
  document.getElementById('pnl-pct').textContent        = fmtPct(pnlPct);
}

function renderTable() {
  const tbody = document.getElementById('holdings-body');
  tbody.innerHTML = '';

  const { active } = loadWosPortfolio();

  const cashTotal = _cashTotal;

  if (!active.length && !cashTotal) {
    const emptyMsg = window.WOS_LANG === 'es' ? 'Sin posiciones aún — agrega tu primer activo.' : 'No holdings yet — add your first asset.';
    tbody.innerHTML = `<tr><td colspan="5" class="table__empty">${emptyMsg}</td></tr>`;
    return;
  }

  active.forEach(({ name, color, value, invested, key }) => {
    const pnl     = value - invested;
    const ret     = invested ? (pnl / invested) * 100 : 0;
    const tabName = key.replace('wos-', '');
    const tr      = document.createElement('tr');
    tr.className  = 'table-row';
    tr.innerHTML  = `
      <td class="td--name"><span class="asset__dot" style="background:${color}"></span><a class="td--link" href="holdings.html#${tabName}">${name}</a></td>
      <td>${fmt(value)}</td>
      <td>${fmt(invested)}</td>
      <td class="${pnl >= 0 ? 'td--up' : 'td--down'}">${(pnl >= 0 ? '+' : '') + fmt(pnl)}</td>
      <td class="${ret >= 0 ? 'td--up' : 'td--down'}">${fmtPct(ret)}</td>
    `;
    tbody.appendChild(tr);
  });

  if (cashTotal > 0) {
    const tr = document.createElement('tr');
    tr.className = 'table-row';
    tr.innerHTML = `
      <td class="td--name"><span class="asset__dot" style="background:#a3e635"></span><a class="td--link" href="accounts.html">${window.WOS_LANG === 'es' ? 'Efectivo' : 'Cash'}</a></td>
      <td>${fmt(cashTotal)}</td>
      <td>—</td>
      <td>—</td>
      <td>—</td>
    `;
    tbody.appendChild(tr);
  }
}

// ─── Canonical categories — must match holdings.html category-nav order ──────
const CATEGORIES = [
  { name: 'Stocks',                  color: '#6366f1', key: 'wos-stocks'  },
  { name: 'Bonos Gubernamentales',   color: '#34d399', key: 'wos-bonos'   },
  { name: 'Fondos de Inversión',     color: '#fbbf24', key: 'wos-fondos'  },
  { name: 'Fibras',                  color: '#f87171', key: 'wos-fibras'  },
  { name: 'Fondos para el Retiro',   color: '#8b5cf6', key: 'wos-retiro'  },
  { name: 'Cryptos',                 color: '#06b6d4', key: 'wos-crypto'  },
  { name: 'Bienes y Raíces',         color: '#ec4899', key: 'wos-bienes'  },
];

// ─── Aggregate portfolio from in-memory cache (populated from API) ────────────
function loadWosPortfolio() {
  const raw = _wosRaw;

  // Value & cost-basis per category
  const catValues = {
    'Stocks':               raw.stocks.reduce((s,h) => s + h.currentPrice * h.shares, 0),
    'Bonos Gubernamentales':raw.bonos.reduce ((s,b) => s + (b.monto || 0), 0),
    'Fondos de Inversión':  raw.fondos.reduce((s,f) => s + f.navActual     * f.unidades, 0),
    'Fibras':               raw.fibras.reduce((s,f) => s + f.precioActual  * f.certificados, 0),
    'Fondos para el Retiro':raw.retiro.reduce((s,r) => s + r.saldo, 0),
    'Cryptos':              raw.crypto.reduce((s,c) => s + c.currentPrice  * c.amount, 0),
    'Bienes y Raíces':      raw.bienes.reduce((s,b) => { const yrs = b.fechaCompra ? (Date.now()-new Date(b.fechaCompra).getTime())/(1000*60*60*24*365.25) : 0; return s + (b.plusvaliaAnual && b.fechaCompra ? b.precioCompra * Math.pow(1+b.plusvaliaAnual/100,yrs) : b.precioCompra); }, 0),
  };
  const catCosts = {
    'Stocks':               raw.stocks.reduce((s,h) => s + h.avgCost      * h.shares, 0),
    'Bonos Gubernamentales':raw.bonos.reduce ((s,b) => s + (b.monto || 0), 0),
    'Fondos de Inversión':  raw.fondos.reduce((s,f) => s + f.precioCompra * f.unidades, 0),
    'Fibras':               raw.fibras.reduce((s,f) => s + f.precioCompra * f.certificados, 0),
    'Fondos para el Retiro':raw.retiro.reduce((s,r) => s + r.saldo - (r.aportacionYTD || 0), 0),
    'Cryptos':              raw.crypto.reduce((s,c) => s + c.avgCost      * c.amount, 0),
    'Bienes y Raíces':      raw.bienes.reduce((s,b) => {
      const gastos = (b.gastosNotariales||0)+(b.escrituracion||0)+(b.impuestoAdquisicion||0)+(b.otrosGastos||0);
      return s + b.precioCompra + gastos;
    }, 0),
  };

  // Daily change helpers
  function dailyDelta(items, valueFn, histFn) {
    return items.reduce((s, x) => {
      const cur  = valueFn(x);
      const hist = x.history || [];
      const prev = hist.length >= 2 ? hist[hist.length - 2] : cur;
      return s + (cur - prev);
    }, 0);
  }
  const dailyChange =
    dailyDelta(raw.stocks, h => h.currentPrice * h.shares) +
    dailyDelta(raw.bonos,  b => b.monto || 0) +
    dailyDelta(raw.fondos, f => f.navActual     * f.unidades) +
    dailyDelta(raw.fibras, f => f.precioActual  * f.certificados) +
    dailyDelta(raw.crypto, c => c.currentPrice  * c.amount);
    // retiro & bienes don't have meaningful daily price swings

  // Aggregate portfolio history across all categories (n days)
  function portfolioHistory(n) {
    const allItems = [
      ...raw.stocks.map(h => ({ hist: h.history, cur: h.currentPrice * h.shares })),
      ...raw.bonos.map (b => ({ hist: b.history, cur: b.monto || 0 })),
      ...raw.fondos.map(f => ({ hist: f.history, cur: f.navActual     * f.unidades })),
      ...raw.fibras.map(f => ({ hist: f.history, cur: f.precioActual  * f.certificados })),
      ...raw.retiro.map(r => ({ hist: r.history, cur: r.saldo })),
      ...raw.crypto.map(c => ({ hist: c.history, cur: c.currentPrice  * c.amount })),
      ...raw.bienes.map(b => { const yrs = b.fechaCompra ? (Date.now()-new Date(b.fechaCompra).getTime())/(1000*60*60*24*365.25) : 0; const cur = b.plusvaliaAnual && b.fechaCompra ? b.precioCompra * Math.pow(1+b.plusvaliaAnual/100,yrs) : b.precioCompra; return { hist: b.history, cur }; }),
    ];
    return Array.from({ length: n }, (_, i) =>
      allItems.reduce((s, { hist, cur }) => {
        const idx = Math.max(0, (hist || []).length - n + i);
        return s + ((hist || [])[idx] ?? cur);
      }, 0)
    );
  }

  const totalValue    = Object.values(catValues).reduce((a,b) => a+b, 0);
  const totalInvested = Object.values(catCosts).reduce((a,b) => a+b, 0);

  // Active categories (non-zero value), in canonical order
  const active = CATEGORIES
    .map(cat => ({ ...cat, value: catValues[cat.name], invested: catCosts[cat.name] }))
    .filter(cat => cat.value > 0);

  return { active, totalValue, totalInvested, dailyChange, portfolioHistory };
}

// ─── Donut ───────────────────────────────────────────────────────────────────
function renderDonut() {
  const svg    = document.getElementById('donut-svg');
  const legend = document.getElementById('legend');
  svg.innerHTML    = '';
  legend.innerHTML = '';

  const { active: unsorted, totalValue: investmentTotal } = loadWosPortfolio();
  const cashTotal = _cashTotal;
  const cashLabel = window.WOS_LANG === 'es' ? 'Efectivo' : 'Cash';
  const allItems = cashTotal > 0
    ? [...unsorted, { name: cashLabel, color: '#a3e635', value: cashTotal }]
    : [...unsorted];
  const totalValue = investmentTotal + cashTotal;
  if (!totalValue) return;

  // Draw donut slices in canonical order; legend sorted largest → smallest
  const active = [...allItems].sort((a, b) => b.value - a.value);

  const cx = 100, cy = 100, r = 72, inner = 44;
  let angle = -Math.PI / 2;

  // Draw SVG slices in canonical order (stable visual position)
  allItems.forEach(({ name, color, value }) => {
    const pct   = value / totalValue;
    const sweep = pct * 2 * Math.PI;
    const x1  = cx + r * Math.cos(angle),             y1  = cy + r * Math.sin(angle);
    angle += sweep;
    const x2  = cx + r * Math.cos(angle),             y2  = cy + r * Math.sin(angle);
    const ix1 = cx + inner * Math.cos(angle - sweep), iy1 = cy + inner * Math.sin(angle - sweep);
    const ix2 = cx + inner * Math.cos(angle),         iy2 = cy + inner * Math.sin(angle);
    const large = sweep > Math.PI ? 1 : 0;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} L${ix2},${iy2} A${inner},${inner} 0 ${large},0 ${ix1},${iy1} Z`);
    path.setAttribute('fill', color);
    path.setAttribute('class', 'donut-slice');
    path.addEventListener('mouseenter', () => {
      document.getElementById('donut-center').innerHTML =
        `<span class="donut__pct">${(pct*100).toFixed(1)}%</span><span class="donut__label">${name}</span>`;
    });
    path.addEventListener('mouseleave', () => {
      document.getElementById('donut-center').innerHTML =
        `<span class="donut__pct">—</span><span class="donut__label">hover slice</span>`;
    });
    svg.appendChild(path);
  });

  // Render legend sorted largest → smallest
  active.forEach(({ name, color, value }) => {
    const pct = value / totalValue;
    const li  = document.createElement('li');
    li.className = 'legend__item';
    li.innerHTML = `
      <span class="legend__dot" style="background:${color}"></span>
      <span class="legend__name">${name}</span>
      <span class="legend__pct">${(pct*100).toFixed(1)}%</span>`;
    legend.appendChild(li);
  });
}

// ─── Line Chart ──────────────────────────────────────────────────────────────
Chart.defaults.color       = '#8892a4';
Chart.defaults.borderColor = '#1e2640';
Chart.defaults.font.family = "'DM Sans', system-ui, sans-serif";
Chart.defaults.font.size   = 11;

let currentRange = '1M';
let lineChart = null;

function setRange(r, btn) {
  currentRange = r;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('tab--active'));
  btn.classList.add('tab--active');
  const dateRow = document.getElementById('date-range-row');
  if (r === 'custom') {
    dateRow.classList.add('date-range-row--visible');
    return; // wait for Apply
  }
  dateRow.classList.remove('date-range-row--visible');
  renderLine(r);
}

function applyCustomRange() {
  const startStr = document.getElementById('date-start').value;
  const endStr   = document.getElementById('date-end').value;
  if (!startStr || !endStr || endStr < startStr) return;

  if (_portfolioHistoryData && _portfolioHistoryData.length > 0) {
    const slice = _portfolioHistoryData.filter(r => r.date >= startStr && r.date <= endStr);
    if (slice.length > 0) {
      const pts   = slice.map(r => r.total_value);
      const dates = slice.map(r => {
        const d = new Date(r.date + 'T12:00:00Z');
        return d.toLocaleDateString(window.WOS_LOCALE || 'en-US', { month: 'short', day: 'numeric' });
      });
      drawLineChart(pts, dates);
      return;
    }
  }

  const msPerDay  = 86400000;
  const startDate = new Date(startStr);
  const endDate   = new Date(endStr);
  const n         = Math.min(Math.round((endDate - startDate) / msPerDay) + 1, 90);
  const labels = Array.from({ length: n }, (_, i) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    return d.toLocaleDateString(window.WOS_LOCALE || 'en-US', { month: 'short', day: 'numeric' });
  });
  const { portfolioHistory, totalValue } = loadWosPortfolio();
  if (!totalValue) return;
  drawLineChart(portfolioHistory(n), labels);
}

function getDateLabels(n) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (n - 1 - i));
    return d.toLocaleDateString(window.WOS_LOCALE || 'en-US', { month: 'short', day: 'numeric' });
  });
}

function renderLine(range) {
  const slices = { '1W': 7, '1M': 30, '3M': 90, 'YTD': 90 };
  const n = slices[range] || 30;

  if (_portfolioHistoryData && _portfolioHistoryData.length > 0) {
    const slice = _portfolioHistoryData.slice(-n);
    const pts   = slice.map(r => r.total_value);
    const dates = slice.map(r => {
      const d = new Date(r.date + 'T12:00:00Z');
      return d.toLocaleDateString(window.WOS_LOCALE || 'en-US', { month: 'short', day: 'numeric' });
    });
    drawLineChart(pts, dates);
    return;
  }

  const { portfolioHistory, totalValue } = loadWosPortfolio();
  if (!totalValue) return;
  drawLineChart(portfolioHistory(n), getDateLabels(n));
}

function gradientFill(ctx, up) {
  const { chart } = ctx;
  const { ctx: c, chartArea } = chart;
  if (!chartArea) return 'transparent';
  const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
  g.addColorStop(0, up ? 'rgba(99,102,241,0.22)' : 'rgba(248,113,113,0.22)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  return g;
}

function drawLineChart(pts, dates) {
  const lineUp = pts[pts.length - 1] >= pts[0];
  const lc     = lineUp ? '#6366f1' : '#f87171';

  if (lineChart) {
    lineChart.data.labels = dates;
    lineChart.data.datasets[0].data = pts;
    lineChart.data.datasets[0].borderColor = lc;
    lineChart.data.datasets[0].pointHoverBackgroundColor = lc;
    lineChart.data.datasets[0].backgroundColor = ctx => gradientFill(ctx, lineUp);
    lineChart.update();
    return;
  }

  lineChart = new Chart(document.getElementById('line-canvas'), {
    type: 'line',
    data: {
      labels: dates,
      datasets: [{
        data: pts,
        borderColor: lc,
        borderWidth: 2,
        fill: true,
        backgroundColor: ctx => gradientFill(ctx, lineUp),
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
}

// ─── Toast Notifications ─────────────────────────────────────────────────────
function showToast(message, type='success'){
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('toast--visible'), 10);
  setTimeout(() => {
    toast.classList.remove('toast--visible');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ─── API Functions ───────────────────────────────────────────────────────────
async function fetchCryptoPrice(ticker){
  const cryptoMap = {
    'BTC': 'bitcoin',
    'ETH': 'ethereum',
    'XRP': 'ripple',
    'ADA': 'cardano',
    'SOL': 'solana',
    'DOGE': 'dogecoin',
    'MATIC': 'polygon',
    'LTC': 'litecoin',
    'BCH': 'bitcoin-cash',
    'LINK': 'chainlink'
  };

  const cryptoId = cryptoMap[ticker] || ticker.toLowerCase();
  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${cryptoId}&vs_currencies=usd&include_last_updated_at=true`
    );
    if(!response.ok) throw new Error('API error');
    const data = await response.json();
    if(data[cryptoId]?.usd) {
      return data[cryptoId].usd;
    }
    throw new Error('Crypto not found');
  } catch(e){
    throw new Error(`Failed to fetch ${ticker}: ${e.message}`);
  }
}

async function fetchStockPrice(ticker){
  // For MVP, we'll use a simple placeholder
  // In production, integrate with FinnHub or similar
  throw new Error('Stock API integration coming soon - use manual entry for now');
}

async function updatePrice(holding){
  try {
    let price;
    if(holding.assetType === 'Crypto'){
      price = await fetchCryptoPrice(holding.ticker);
    } else if(holding.assetType === 'Stock' || holding.assetType === 'ETF'){
      price = await fetchStockPrice(holding.ticker);
    } else {
      // Bond and Property are manual only
      return null;
    }

    holding.price = price;
    holding.lastUpdated = new Date().toISOString();
    return price;
  } catch(e){
    throw e;
  }
}

async function refreshPrices(){
  const btn = document.getElementById('refresh-btn');
  btn.disabled = true;
  btn.classList.add('btn--loading');

  let successCount = 0;
  let errorCount = 0;
  const errors = [];

  for(let holding of holdings){
    if(holding.assetType === 'Bond' || holding.assetType === 'Property'){
      continue; // Skip manual-only assets
    }
    try {
      await updatePrice(holding);
      successCount++;
    } catch(e){
      errorCount++;
      errors.push(e.message);
    }
  }

  save();
  render();
  btn.disabled = false;
  btn.classList.remove('btn--loading');

  const isES = window.WOS_LANG === 'es';
  if(errorCount === 0 && successCount > 0){
    showToast(`✓ ${isES ? 'Actualizados' : 'Updated'} ${successCount} ${isES ? (successCount !== 1 ? 'precios' : 'precio') : (successCount !== 1 ? 'prices' : 'price')}`, 'success');
  } else if(successCount > 0 && errorCount > 0){
    showToast(`✓ ${isES ? 'Actualizados' : 'Updated'} ${successCount}, ✗ ${isES ? 'Fallidos' : 'Failed'} ${errorCount}`, 'warning');
  } else if(errorCount > 0){
    showToast(`✗ ${isES ? 'Error al actualizar' : 'Failed to update'}: ${errors[0]}`, 'error');
  } else {
    showToast(isES ? 'Sin activos para actualizar (solo Bonos y Propiedades)' : 'No assets to update (only Bonds and Properties)', 'info');
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
setVisitorCount();
render(); // show empty state immediately while API loads
(async () => {
  await Promise.all([
    refreshPortfolio().catch(() => {}),
    refreshPortfolioHistory(),
  ]);
  render();
})();
