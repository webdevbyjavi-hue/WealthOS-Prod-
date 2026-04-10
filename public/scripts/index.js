// ─── Tracking ─────────────────────────────────────────────────────────────────
function setVisitorCount(){
  const visits = Number(localStorage.getItem('folio-visit-count') || '0') + 1;
  localStorage.setItem('folio-visit-count', visits);
}

// ─── State ───────────────────────────────────────────────────────────────────
let holdings = JSON.parse(localStorage.getItem('folio-holdings') || '[]');

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

// ─── Add Asset (routes to the right storage key) ─────────────────────────────
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

function addAsset_stocks(){
  const ticker = document.getElementById('m-s-ticker').value.trim().toUpperCase();
  const name   = document.getElementById('m-s-name').value.trim();
  const shares = parseFloat(document.getElementById('m-s-shares').value);
  const cost   = parseFloat(document.getElementById('m-s-cost').value);
  const price  = parseFloat(document.getElementById('m-s-price').value);
  if(!ticker || !name || isNaN(shares) || isNaN(cost) || isNaN(price)){
    alert('Please fill in all fields.'); return;
  }
  const list = JSON.parse(localStorage.getItem('wos-stocks') || '[]');
  const existing = list.find(h => h.ticker === ticker);
  if(existing){
    const total = existing.shares + shares;
    existing.avgCost = (existing.shares * existing.avgCost + shares * cost) / total;
    existing.shares = total; existing.currentPrice = price; existing.name = name;
    showToast(`Merged with existing ${ticker} position.`);
  } else {
    list.push({ id: Date.now(), ticker, name, shares, avgCost: cost, currentPrice: price, history: generateHistory(price) });
  }
  localStorage.setItem('wos-stocks', JSON.stringify(list));
  logEvent({ type: 'investment_added', category: 'Investment', icon: '📈', title: `Added Stock: ${ticker}`, detail: `${shares} shares @ $${cost} · ${name}`, amount: shares * price });
  render(); closeModal();
}

function addAsset_bonos(){
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
  const list = JSON.parse(localStorage.getItem('wos-bonos') || '[]');
  const existing = list.find(x => x.instrumento === instrumento && x.serie === serie);
  if(existing){
    const total = existing.titulos + titulos;
    existing.precioCompra = (existing.titulos * existing.precioCompra + titulos * precioCompra) / total;
    existing.titulos = total; existing.precioActual = precioActual; existing.rendimiento = rendimiento;
    showToast(`Posición consolidada con ${instrumento} ${serie}.`);
  } else {
    list.push({ id: Date.now(), instrumento, serie, titulos, valorNominal, precioCompra, precioActual, tasaCupon, rendimiento, vencimiento, history: generateHistory(precioActual * titulos) });
  }
  localStorage.setItem('wos-bonos', JSON.stringify(list));
  logEvent({ type: 'investment_added', category: 'Investment', icon: '🏛️', title: `Added Bono: ${instrumento} ${serie}`, detail: `${titulos} títulos @ $${precioCompra} · Vence ${vencimiento}`, amount: precioActual * titulos });
  render(); closeModal();
}

function addAsset_fondos(){
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
  const list = JSON.parse(localStorage.getItem('wos-fondos') || '[]');
  const existing = list.find(f => f.clave === clave);
  if(existing){
    const total = existing.unidades + unidades;
    existing.precioCompra = (existing.unidades * existing.precioCompra + unidades * precioCompra) / total;
    existing.unidades = total; existing.navActual = navActual; existing.rendimiento = rendimiento;
    showToast(`Posición consolidada con ${clave}.`);
  } else {
    list.push({ id: Date.now(), clave, nombre, operadora, tipo, unidades, precioCompra, navActual, rendimiento, history: generateHistory(navActual * unidades) });
  }
  localStorage.setItem('wos-fondos', JSON.stringify(list));
  logEvent({ type: 'investment_added', category: 'Investment', icon: '📊', title: `Added Fondo: ${clave}`, detail: `${unidades} unidades · ${nombre} (${operadora})`, amount: navActual * unidades });
  render(); closeModal();
}

function addAsset_fibras(){
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
  const list = JSON.parse(localStorage.getItem('wos-fibras') || '[]');
  const existing = list.find(f => f.ticker === ticker);
  if(existing){
    const total = existing.certificados + certificados;
    existing.precioCompra = (existing.certificados * existing.precioCompra + certificados * precioCompra) / total;
    existing.certificados = total; existing.precioActual = precioActual; existing.distribucion = distribucion; existing.rendimiento = rendimiento;
    showToast(`Posición consolidada con ${ticker}.`);
  } else {
    list.push({ id: Date.now(), ticker, nombre, sector, certificados, precioCompra, precioActual, distribucion, rendimiento, history: generateHistory(precioActual * certificados) });
  }
  localStorage.setItem('wos-fibras', JSON.stringify(list));
  logEvent({ type: 'investment_added', category: 'Investment', icon: '🏢', title: `Added Fibra: ${ticker}`, detail: `${certificados} certificados @ $${precioCompra} · ${nombre}`, amount: precioActual * certificados });
  render(); closeModal();
}

function addAsset_retiro(){
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
  const list = JSON.parse(localStorage.getItem('wos-retiro') || '[]');
  list.push({ id: Date.now(), tipo, nombre, institucion, subcuenta, saldo, aportacionYTD, aportacionPatronal, rendimiento, proyeccion, history: generateHistory(saldo) });
  localStorage.setItem('wos-retiro', JSON.stringify(list));
  logEvent({ type: 'investment_added', category: 'Investment', icon: '🏦', title: `Added Retiro: ${nombre}`, detail: `Saldo $${saldo.toLocaleString()} · ${tipo} (${institucion})`, amount: saldo });
  render(); closeModal();
}

function addAsset_crypto(){
  const symbol       = document.getElementById('m-c-symbol').value.trim().toUpperCase();
  const name         = document.getElementById('m-c-name').value.trim();
  const amount       = parseFloat(document.getElementById('m-c-amount').value);
  const avgCost      = parseFloat(document.getElementById('m-c-cost').value);
  const currentPrice = parseFloat(document.getElementById('m-c-price').value);
  if(!symbol || !name || isNaN(amount) || isNaN(avgCost) || isNaN(currentPrice)){
    alert('Please fill in all required fields.'); return;
  }
  const list = JSON.parse(localStorage.getItem('wos-crypto') || '[]');
  const existing = list.find(c => c.symbol === symbol);
  if(existing){
    const total = existing.amount + amount;
    existing.avgCost = (existing.amount * existing.avgCost + amount * avgCost) / total;
    existing.amount = total; existing.currentPrice = currentPrice; existing.name = name;
    showToast(`Merged with existing ${symbol} position.`);
  } else {
    list.push({ id: Date.now(), symbol, name, amount, avgCost, currentPrice, history: generateHistory(currentPrice * amount) });
  }
  localStorage.setItem('wos-crypto', JSON.stringify(list));
  logEvent({ type: 'investment_added', category: 'Investment', icon: '🪙', title: `Added Crypto: ${symbol}`, detail: `${amount} tokens @ $${avgCost} · ${name}`, amount: currentPrice * amount });
  render(); closeModal();
}

function addAsset_bienes(){
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
  const list = JSON.parse(localStorage.getItem('wos-bienes') || '[]');
  list.push({ id: Date.now(), nombre, tipo, ubicacion, precioCompra, valorActual, gastosNotariales, escrituracion, impuestoAdquisicion, otrosGastos, saldoHipoteca, rentaMensual, history: generateHistory(valorActual) });
  localStorage.setItem('wos-bienes', JSON.stringify(list));
  logEvent({ type: 'investment_added', category: 'Investment', icon: '🏠', title: `Added Propiedad: ${nombre}`, detail: `${tipo} · ${ubicacion} · Valor $${valorActual.toLocaleString()}`, amount: valorActual });
  render(); closeModal();
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

  let cashTotal = 0;
  try {
    const accounts = JSON.parse(localStorage.getItem('wealthos_accounts') || '[]');
    cashTotal = accounts.reduce((s, a) => s + (a.balanceMXN || 0), 0);
  } catch(e) {}

  const totalValue = investmentValue + cashTotal;
  const pnl    = totalValue - totalInvested;
  const pnlPct = totalInvested ? (pnl / totalInvested) * 100 : 0;

  document.getElementById('total-value').textContent    = fmt(totalValue);
  document.getElementById('total-change').textContent   = fmtPct(pnlPct);
  document.getElementById('total-change').className     = 'kpi__change ' + (pnlPct >= 0 ? 'kpi__change--up' : 'kpi__change--down');
  document.getElementById('daily-change').textContent   = (dailyChange >= 0 ? '+' : '') + fmt(dailyChange);
  document.getElementById('total-invested').textContent = fmt(totalInvested);
  document.getElementById('unrealized-pnl').textContent = (pnl >= 0 ? '+' : '') + fmt(pnl);
  document.getElementById('pnl-pct').textContent        = fmtPct(pnlPct);
}

function renderTable() {
  const tbody = document.getElementById('holdings-body');
  tbody.innerHTML = '';

  const { active } = loadWosPortfolio();

  // Cash: sum all bank accounts (stored as MXN equivalent)
  let cashTotal = 0;
  try {
    const accounts = JSON.parse(localStorage.getItem('wealthos_accounts') || '[]');
    cashTotal = accounts.reduce((s, a) => s + (a.balanceMXN || 0), 0);
  } catch(e) {}

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

// ─── Read & aggregate all holdings from wos-* localStorage keys ──────────────
function loadWosPortfolio() {
  const raw = {
    stocks : JSON.parse(localStorage.getItem('wos-stocks')  || '[]'),
    bonos  : JSON.parse(localStorage.getItem('wos-bonos')   || '[]'),
    fondos : JSON.parse(localStorage.getItem('wos-fondos')  || '[]'),
    fibras : JSON.parse(localStorage.getItem('wos-fibras')  || '[]'),
    retiro : JSON.parse(localStorage.getItem('wos-retiro')  || '[]'),
    crypto : JSON.parse(localStorage.getItem('wos-crypto')  || '[]'),
    bienes : JSON.parse(localStorage.getItem('wos-bienes')  || '[]'),
  };

  // Value & cost-basis per category
  const catValues = {
    'Stocks':               raw.stocks.reduce((s,h) => s + h.currentPrice * h.shares, 0),
    'Bonos Gubernamentales':raw.bonos.reduce ((s,b) => s + b.precioActual  * b.titulos, 0),
    'Fondos de Inversión':  raw.fondos.reduce((s,f) => s + f.navActual     * f.unidades, 0),
    'Fibras':               raw.fibras.reduce((s,f) => s + f.precioActual  * f.certificados, 0),
    'Fondos para el Retiro':raw.retiro.reduce((s,r) => s + r.saldo, 0),
    'Cryptos':              raw.crypto.reduce((s,c) => s + c.currentPrice  * c.amount, 0),
    'Bienes y Raíces':      raw.bienes.reduce((s,b) => { const yrs = b.fechaCompra ? (Date.now()-new Date(b.fechaCompra).getTime())/(1000*60*60*24*365.25) : 0; return s + (b.plusvaliaAnual && b.fechaCompra ? b.precioCompra * Math.pow(1+b.plusvaliaAnual/100,yrs) : b.precioCompra); }, 0),
  };
  const catCosts = {
    'Stocks':               raw.stocks.reduce((s,h) => s + h.avgCost      * h.shares, 0),
    'Bonos Gubernamentales':raw.bonos.reduce ((s,b) => s + b.precioCompra * b.titulos, 0),
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
    dailyDelta(raw.bonos,  b => b.precioActual  * b.titulos) +
    dailyDelta(raw.fondos, f => f.navActual     * f.unidades) +
    dailyDelta(raw.fibras, f => f.precioActual  * f.certificados) +
    dailyDelta(raw.crypto, c => c.currentPrice  * c.amount);
    // retiro & bienes don't have meaningful daily price swings

  // Aggregate portfolio history across all categories (n days)
  function portfolioHistory(n) {
    const allItems = [
      ...raw.stocks.map(h => ({ hist: h.history, cur: h.currentPrice * h.shares })),
      ...raw.bonos.map (b => ({ hist: b.history, cur: b.precioActual  * b.titulos })),
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

  // Include cash from bank accounts
  let cashTotal = 0;
  try {
    const accounts = JSON.parse(localStorage.getItem('wealthos_accounts') || '[]');
    cashTotal = accounts.reduce((s, a) => s + (a.balanceMXN || 0), 0);
  } catch(e) {}

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

// ─── Init ────────────────────────────────────────────────────────────────────
// Seed demo data if empty
if(!holdings.length){
  holdings = [
    {id:1, name:'Apple Inc.', assetType:'Stock', ticker:'AAPL', sector:'Technology', shares:12, cost:145, price:189.50, lastUpdated: new Date().toISOString(), history: generateHistory(189.50)},
    {id:2, name:'NVIDIA Corp.', assetType:'Stock', ticker:'NVDA', sector:'Technology', shares:5, cost:220, price:875.40, lastUpdated: new Date().toISOString(), history: generateHistory(875.40)},
    {id:3, name:'S&P 500 ETF', assetType:'ETF', ticker:'SPY', sector:'ETF', shares:8, cost:390, price:521.30, lastUpdated: new Date().toISOString(), history: generateHistory(521.30)},
    {id:4, name:'JPMorgan Chase', assetType:'Stock', ticker:'JPM', sector:'Finance', shares:15, cost:138, price:197.80, lastUpdated: new Date().toISOString(), history: generateHistory(197.80)},
  ];
  save();
}

setVisitorCount();
render();
