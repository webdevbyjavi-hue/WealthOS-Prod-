// ─── WealthOS API Client ──────────────────────────────────────────────────────
// Central client for all communication with the Express backend.
// Loaded before auth.js and sync.js on every page.

(function () {
  const API_BASE  = 'https://wealthos-api-lnhc.onrender.com';
  const TOKEN_KEY = 'wos_token';

  // ─── Token helpers ──────────────────────────────────────────────────────────
  function getToken()      { return localStorage.getItem(TOKEN_KEY); }
  function setToken(t)     { localStorage.setItem(TOKEN_KEY, t); }
  function clearToken()    { localStorage.removeItem(TOKEN_KEY); }

  // ─── Core fetch wrapper ─────────────────────────────────────────────────────
  async function request(method, path, body) {
    const token   = getToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const res  = await fetch(API_BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err  = new Error(json.message || 'API error');
      err.status = res.status;
      err.data   = json;
      throw err;
    }
    return json;
  }

  // ─── Field mappers (camelCase localStorage ↔ snake_case API) ────────────────
  const mappers = {
    stocks: {
      toApi:   h => ({ ticker: h.ticker, name: h.name, shares: h.shares, avg_cost: h.avgCost, current_price: h.currentPriceUsd ?? h.currentPrice }),
      fromApi: h => ({ id: h.id, ticker: h.ticker, name: h.name, shares: parseFloat(h.shares), avgCost: parseFloat(h.avg_cost), currentPrice: parseFloat(h.current_price), avgCostUsd: h.avg_cost_usd ? parseFloat(h.avg_cost_usd) : null, currentPriceUsd: h.current_price_usd ? parseFloat(h.current_price_usd) : null, tipoDeCambio: h.tipo_de_cambio ? parseFloat(h.tipo_de_cambio) : null }),
    },
    bonos: {
      toApi:   b => ({ tipo: b.tipo, plazo: b.plazo, serie_banxico: b.serieBanxico, purchase_date: b.purchaseDate, tasa_compra: b.tasaCompra, monto: b.monto, descripcion: b.descripcion || null }),
      fromApi: b => ({ id: b.id, tipo: b.tipo, plazo: b.plazo, serieBanxico: b.serie_banxico, purchaseDate: b.purchase_date, tasaCompra: parseFloat(b.tasa_compra), monto: parseFloat(b.monto), descripcion: b.descripcion || '', history: _fakeHistory(parseFloat(b.monto)) }),
    },
    fondos: {
      toApi:   f => ({ clave: f.clave, nombre: f.nombre, operadora: f.operadora, unidades: f.unidades, precio_compra: f.precioCompra, nav_actual: f.navActual, rendimiento: f.rendimiento, tipo: f.tipo }),
      fromApi: f => ({ id: f.id, clave: f.clave, nombre: f.nombre, operadora: f.operadora, unidades: parseFloat(f.unidades), precioCompra: parseFloat(f.precio_compra), navActual: parseFloat(f.nav_actual), rendimiento: parseFloat(f.rendimiento), tipo: f.tipo, history: _fakeHistory(parseFloat(f.nav_actual) * parseFloat(f.unidades)) }),
    },
    fibras: {
      toApi:   f => ({ ticker: f.ticker, nombre: f.nombre, sector: f.sector, certificados: f.certificados, precio_compra: f.precioCompra, precio_actual: f.precioActual, distribucion: f.distribucion, rendimiento: f.rendimiento }),
      fromApi: f => ({ id: f.id, ticker: f.ticker, nombre: f.nombre, sector: f.sector, certificados: parseInt(f.certificados), precioCompra: parseFloat(f.precio_compra), precioActual: parseFloat(f.precio_actual), distribucion: parseFloat(f.distribucion), rendimiento: parseFloat(f.rendimiento) }),
    },
    retiro: {
      toApi:   r => ({ tipo: r.tipo, nombre: r.nombre, institucion: r.institucion, subcuenta: r.subcuenta, saldo: r.saldo, aportacion_ytd: r.aportacionYTD || 0, aportacion_patronal: r.aportacionPatronal || 0, rendimiento: r.rendimiento, proyeccion: r.proyeccion || 0 }),
      fromApi: r => ({ id: r.id, tipo: r.tipo, nombre: r.nombre, institucion: r.institucion, subcuenta: r.subcuenta, saldo: parseFloat(r.saldo), aportacionYTD: parseFloat(r.aportacion_ytd), aportacionPatronal: parseFloat(r.aportacion_patronal), rendimiento: parseFloat(r.rendimiento), proyeccion: parseFloat(r.proyeccion), history: _fakeHistory(parseFloat(r.saldo)) }),
    },
    bienes: {
      toApi:   b => ({ nombre: b.nombre, tipo: b.tipo, ubicacion: b.ubicacion || '', precio_compra: b.precioCompra, fecha_compra: b.fechaCompra || null, plusvalia_anual: b.plusvaliaAnual || 0, valor_actual: b.valorActual || b.precioCompra, gastos_notariales: b.gastosNotariales || 0, escrituracion: b.escrituracion || 0, impuesto_adquisicion: b.impuestoAdquisicion || 0, otros_gastos: b.otrosGastos || 0, saldo_hipoteca: b.saldoHipoteca || 0, renta_mensual: b.rentaMensual || 0 }),
      fromApi: b => ({ id: b.id, nombre: b.nombre, tipo: b.tipo, ubicacion: b.ubicacion || '', precioCompra: parseFloat(b.precio_compra), fechaCompra: b.fecha_compra || null, plusvaliaAnual: parseFloat(b.plusvalia_anual) || 0, valorActual: parseFloat(b.valor_actual) || parseFloat(b.precio_compra), gastosNotariales: parseFloat(b.gastos_notariales) || 0, escrituracion: parseFloat(b.escrituracion) || 0, impuestoAdquisicion: parseFloat(b.impuesto_adquisicion) || 0, otrosGastos: parseFloat(b.otros_gastos) || 0, saldoHipoteca: parseFloat(b.saldo_hipoteca) || 0, rentaMensual: parseFloat(b.renta_mensual) || 0, history: _fakeHistory(parseFloat(b.valor_actual) || parseFloat(b.precio_compra)) }),
    },
    crypto: {
      toApi:   c => ({ symbol: c.symbol, name: c.name, amount: c.amount, avg_cost: c.avgCost, current_price: c.currentPrice }),
      fromApi: c => ({ id: c.id, symbol: c.symbol, name: c.name, amount: parseFloat(c.amount), avgCost: parseFloat(c.avg_cost), currentPrice: parseFloat(c.current_price) }),
    },
    accounts: {
      toApi:   a => ({ name: a.name, bank: a.bank, country: a.country, type: a.type, currency: a.currency || 'MXN', balance: a.balance, fx_rate: a.fxRate || 1, notes: a.notes }),
      fromApi: a => ({ id: a.id, name: a.name, bank: a.bank, country: a.country, type: a.type, currency: a.currency, balance: parseFloat(a.balance), fxRate: parseFloat(a.fx_rate), balanceMXN: parseFloat(a.balance) * parseFloat(a.fx_rate), notes: a.notes, updatedAt: a.updated_at }),
    },
    transactions: {
      toApi:   t => ({ type: t.type, amount: t.amount, fx_rate: t.fxRate || 1, description: t.description || null, date: t.date, currency: t.currency || null }),
      fromApi: t => ({ id: t.id, accountId: t.account_id, type: t.type, amount: parseFloat(t.amount), fxRate: parseFloat(t.fx_rate) || 1, amountMXN: parseFloat(t.amount) * (parseFloat(t.fx_rate) || 1), date: t.date, description: t.description || '', currency: t.currency || null }),
    },
  };

  // Generate placeholder history for charts (91 pts ending at current price)
  function _fakeHistory(price) {
    if (!price || isNaN(price)) return [];
    const pts = [];
    let p = price * (0.75 + Math.random() * 0.3);
    for (let i = 0; i < 90; i++) {
      p = Math.max(p * (1 + (Math.random() - 0.48) * 0.022), 0.01);
      pts.push(parseFloat(p.toFixed(2)));
    }
    pts.push(parseFloat(price.toFixed(2)));
    return pts;
  }

  // ─── Public API object ──────────────────────────────────────────────────────
  window.WOS_API = {
    getToken,
    setToken,
    clearToken,
    isAuthenticated: () => !!getToken(),

    // ── Auth ────────────────────────────────────────────────────────────────
    auth: {
      signup:        (email, password) => request('POST', '/api/auth/signup',         { email, password }),
      signin:        (email, password) => request('POST', '/api/auth/signin',         { email, password }),
      signout:       ()                => request('POST', '/api/auth/signout'),
      me:            ()                => request('GET',  '/api/auth/me'),
    },

    // ── Holdings (generic) ───────────────────────────────────────────────────
    holdings: {
      list:   (cat)     => request('GET',    `/api/${cat}`).then(r => r.data.map(mappers[cat].fromApi)),
      create: (cat, d)  => request('POST',   `/api/${cat}`, mappers[cat].toApi(d)).then(r => mappers[cat].fromApi(r.data)),
      update: (cat, id, d) => request('PUT', `/api/${cat}/${id}`, mappers[cat].toApi(d)).then(r => mappers[cat].fromApi(r.data)),
      remove: (cat, id) => request('DELETE', `/api/${cat}/${id}`),
    },

    // ── Accounts ─────────────────────────────────────────────────────────────
    accounts: {
      list:              ()       => request('GET',    '/api/accounts').then(r => r.data.map(mappers.accounts.fromApi)),
      create:            (d)      => request('POST',   '/api/accounts', mappers.accounts.toApi(d)).then(r => mappers.accounts.fromApi(r.data)),
      update:            (id, d)  => request('PUT',    `/api/accounts/${id}`, mappers.accounts.toApi(d)).then(r => mappers.accounts.fromApi(r.data)),
      remove:            (id)     => request('DELETE', `/api/accounts/${id}`),
      listTransactions:  (id)     => request('GET',    `/api/accounts/${id}/transactions`).then(r => r.data.map(mappers.transactions.fromApi)),
      createTransaction: (id, d)  => request('POST',   `/api/accounts/${id}/transactions`, mappers.transactions.toApi(d)).then(r => mappers.transactions.fromApi(r.data)),
      deleteTransaction: (aid, tid) => request('DELETE', `/api/accounts/${aid}/transactions/${tid}`),
    },

    // ── History ───────────────────────────────────────────────────────────────
    history: {
      list:   (params = {}) => { const q = new URLSearchParams(params).toString(); return request('GET', '/api/history' + (q ? '?' + q : '')).then(r => r.data); },
      create: (d)           => request('POST',   '/api/history', d).then(r => r.data),
      remove: (id)          => request('DELETE', `/api/history/${id}`),
      clear:  ()            => request('DELETE', '/api/history'),
    },

    // ── Bonos — catalog + live Banxico rate lookup ────────────────────────────
    bonos: {
      /** Full static catalog: { catalog: [...], tipos: [...] } */
      getCatalog: () => request('GET', '/api/bonos/catalog').then(r => r.data),
      /** Latest Tasa de Interés for a Banxico series ID (e.g. "SF43936"). */
      getTasa: (serieBanxico) => request('GET', `/api/bonos/tasa/${encodeURIComponent(serieBanxico)}`).then(r => r.data),
    },

    // ── Lookup ────────────────────────────────────────────────────────────────
    lookup: {
      ticker: (symbol, date) => {
        const path = date
          ? `/api/lookup/ticker/${encodeURIComponent(symbol)}?date=${encodeURIComponent(date)}`
          : `/api/lookup/ticker/${encodeURIComponent(symbol)}`;
        return request('GET', path).then(r => r.data);
      },
      fibra:  (ticker) => request('GET', `/api/lookup/fibra/${encodeURIComponent(ticker)}`).then(r => r.data),
      crypto: (symbol) => request('GET', `/api/lookup/crypto/${encodeURIComponent(symbol)}`).then(r => r.data),
    },

    // ── Assets (time-series history) ─────────────────────────────────────────
    assets: {
      /** Returns array of asset objects owned by the authenticated user. */
      list: () => request('GET', '/api/assets').then(r => r.data),
      /**
       * Returns { asset, history: [{ date, value, open, high, low, volume }] }
       * for the given asset over the specified date range.
       */
      history: (id, from, to) =>
        request('GET', `/api/assets/${encodeURIComponent(id)}/history?from=${from}&to=${to}`)
          .then(r => r.data),
    },

    // ── Prices (shared historical price data from stocks_snapshot) ────────────
    prices: {
      /**
       * Returns [{ date, open, high, low, close, volume }] for a symbol.
       * Symbol must be in TwelveData format: 'AAPL', 'BTC/USD', 'FUNO11.MX'
       */
      history: (symbol, from, to) => {
        const p = new URLSearchParams({ symbol });
        if (from) p.set('from', from);
        if (to)   p.set('to',   to);
        return request('GET', `/api/prices/history?${p}`).then(r => r.data);
      },
    },

    // ── Portfolio (total value trendline) ─────────────────────────────────────
    portfolio: {
      /**
       * Returns [{ date, total_value }] — sum of all stocks/fibras/crypto
       * holdings valued at daily close, derived from the portfolio_daily_value view.
       */
      history: (from, to) => {
        const p = new URLSearchParams();
        if (from) p.set('from', from);
        if (to)   p.set('to',   to);
        return request('GET', `/api/portfolio/history?${p}`).then(r => r.data);
      },
    },

    // ── Exchange rates ────────────────────────────────────────────────────────
    exchangeRate: {
      getUsdMxn: () => request('GET', '/api/exchange-rates/usd-mxn').then(r => r.data),
    },

    // Expose mappers for sync.js
    _mappers: mappers,
  };
})();
