// ─── WealthOS Sync Layer ──────────────────────────────────────────────────────
// Bridges localStorage ↔ backend API.
//
// Strategy (optimistic UI):
//   • UI reads from localStorage immediately → stays fast
//   • On page load, fetch from API → update localStorage → re-render
//   • On every save, write to localStorage first, then POST/PUT to API silently
//
// Requires api.js and auth.js to be loaded first.

(function () {
  const LS_KEYS = {
    stocks:   'wos-stocks',
    bonos:    'wos-bonos',
    fondos:   'wos-fondos',
    fibras:   'wos-fibras',
    retiro:   'wos-retiro',
    crypto:   'wos-crypto',
    bienes:   'wos-bienes',
    accounts: 'wealthos_accounts',
  };

  // ─── Read / write localStorage ──────────────────────────────────────────────
  function lsGet(key)       { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } }
  function lsSet(key, data) { localStorage.setItem(key, JSON.stringify(data)); }

  // ─── Re-render page after sync ──────────────────────────────────────────────
  // Calls whichever render functions are defined on the current page.
  function refresh() {
    const fns = [
      'render',           // index.js
      'renderAll',        // holdings.js stocks
      'renderAllBonos',
      'renderAllFondos',
      'renderAllFibras',
      'renderAllRetiro',
      'renderAllBienes',
      'renderAllCrypto',
      'renderAccountsPage', // accounts.html
      'renderHistoryPage',  // history.html
    ];
    fns.forEach(fn => { if (typeof window[fn] === 'function') { try { window[fn](); } catch (_) {} } });
  }

  // ─── Fetch all holdings from API, write to localStorage, re-render ──────────
  async function syncCategory(cat) {
    if (!WOS_API.isAuthenticated()) return;
    try {
      const items = await WOS_API.holdings.list(cat);
      lsSet(LS_KEYS[cat], items);
    } catch (err) {
      if (err.status === 401) { WOS_AUTH.signout(); }
      // Silently ignore other errors — localStorage data stays as-is
    }
  }

  async function syncAccounts() {
    if (!WOS_API.isAuthenticated()) return;
    try {
      const items = await WOS_API.accounts.list();
      lsSet(LS_KEYS.accounts, items);
    } catch (err) {
      if (err.status === 401) WOS_AUTH.signout();
    }
  }

  // ─── Full sync (all categories) then re-render ──────────────────────────────
  async function run() {
    if (!WOS_API.isAuthenticated()) return;
    await Promise.all([
      syncCategory('stocks'),
      syncCategory('bonos'),
      syncCategory('fondos'),
      syncCategory('fibras'),
      syncCategory('retiro'),
      syncCategory('crypto'),
      syncCategory('bienes'),
      syncAccounts(),
    ]);
    refresh();
  }

  // ─── Patch save functions — write to API after localStorage ─────────────────
  // We wait for page scripts to load (setTimeout 0), then wrap their save fns.

  function patchSaveFn(fnName, cat, getList, idField = 'id') {
    const original = window[fnName];
    if (typeof original !== 'function') return;

    window[fnName] = function (...args) {
      original.apply(this, args);           // Run original (updates localStorage)
      if (!WOS_API.isAuthenticated()) return;

      // After the original runs, the in-memory array has the latest state.
      // We sync the entire in-memory list to the API.
      const list = getList();
      syncListToApi(cat, list, idField).catch(() => {});
    };
  }

  // Sync an entire in-memory list to the API:
  //   • Items with string UUIDs already exist in the DB → PUT
  //   • Items with numeric ids (Date.now()) are new → POST, then update local id
  async function syncListToApi(cat, list, idField = 'id') {
    if (!WOS_API.isAuthenticated()) return;

    // Fetch current state from API so we know which ids exist
    let apiItems = [];
    try { apiItems = await WOS_API.holdings.list(cat); } catch { return; }
    const apiIds = new Set(apiItems.map(i => i[idField]));

    for (const item of list) {
      const isNew = typeof item[idField] === 'number'; // Date.now() → numeric

      if (isNew) {
        try {
          const created = await WOS_API.holdings.create(cat, item);
          // Replace the numeric id with the real UUID from the DB
          item[idField] = created[idField];
        } catch (_) {}
      } else if (apiIds.has(item[idField])) {
        try { await WOS_API.holdings.update(cat, item[idField], item); } catch (_) {}
      }
    }

    // Items in API but not in local list → delete
    const localIds = new Set(list.map(i => i[idField]));
    for (const apiItem of apiItems) {
      if (!localIds.has(apiItem[idField])) {
        try { await WOS_API.holdings.remove(cat, apiItem[idField]); } catch (_) {}
      }
    }

    // Persist the updated list (with real UUIDs) back to localStorage
    lsSet(LS_KEYS[cat], list);
  }

  // ─── Patch account save functions ───────────────────────────────────────────
  async function syncAccountsToApi(list) {
    if (!WOS_API.isAuthenticated()) return;
    let apiItems = [];
    try { apiItems = await WOS_API.accounts.list(); } catch { return; }
    const apiIds = new Set(apiItems.map(a => a.id));

    for (const item of list) {
      const isNew = typeof item.id === 'number';
      if (isNew) {
        try {
          const created = await WOS_API.accounts.create(item);
          item.id = created.id;
        } catch (_) {}
      } else if (apiIds.has(item.id)) {
        try { await WOS_API.accounts.update(item.id, item); } catch (_) {}
      }
    }
    const localIds = new Set(list.map(a => a.id));
    for (const apiItem of apiItems) {
      if (!localIds.has(apiItem.id)) {
        try { await WOS_API.accounts.remove(apiItem.id); } catch (_) {}
      }
    }
    lsSet(LS_KEYS.accounts, list);
  }

  // ─── Wire patches after page scripts have loaded ────────────────────────────
  setTimeout(() => {
    // Holdings save functions → patch to also sync to API
    patchSaveFn('saveStocks',  'stocks',  () => lsGet('wos-stocks'));
    patchSaveFn('saveBonos',   'bonos',   () => lsGet('wos-bonos'));
    patchSaveFn('saveFondos',  'fondos',  () => lsGet('wos-fondos'));
    patchSaveFn('saveFibras',  'fibras',  () => lsGet('wos-fibras'));
    patchSaveFn('persistRetiro', 'retiro', () => lsGet('wos-retiro'));
    patchSaveFn('persistBienes', 'bienes', () => lsGet('wos-bienes'));
    patchSaveFn('persistCrypto', 'crypto', () => lsGet('wos-crypto'));

    // Accounts save — different shape so handled separately
    const origSaveAccounts = window.saveAccounts;
    if (typeof origSaveAccounts === 'function') {
      window.saveAccounts = function (...args) {
        origSaveAccounts.apply(this, args);
        if (!WOS_API.isAuthenticated()) return;
        syncAccountsToApi(lsGet('wealthos_accounts')).catch(() => {});
      };
    }

    // index.js also writes via saveStocks/saveBonos etc directly to LS before
    // calling logEvent — those are already patched above. No extra work needed.

  }, 0);

  // ─── Run initial sync on page load ──────────────────────────────────────────
  // Small delay so page scripts initialise their in-memory arrays first.
  if (WOS_API.isAuthenticated()) {
    setTimeout(run, 300);
  }

  // Expose so auth.js can trigger a sync after login
  window.WOS_SYNC = { run };
})();
