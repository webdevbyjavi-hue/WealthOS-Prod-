// ─── WealthOS Event Logger ───────────────────────────────────────────────────
// Shared utility. Include before any page script that calls logEvent().
// Stores up to 500 events in localStorage under 'wealthos_history'.

(function () {
  const KEY = 'wealthos_history';

  window.logEvent = function ({ type, category, icon, title, detail, amount }) {
    const event = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      timestamp: new Date().toISOString(),
      type,
      category,   // 'Investment' | 'Account' | 'Transaction'
      icon: icon || '•',
      title,
      detail: detail || '',
      amount: (amount !== undefined && amount !== null) ? amount : null,
    };

    // Write to localStorage (instant, always)
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    list.unshift(event);
    if (list.length > 500) list.length = 500;
    localStorage.setItem(KEY, JSON.stringify(list));

    // Also post to API (fire-and-forget, requires api.js)
    if (typeof WOS_API !== 'undefined' && WOS_API.isAuthenticated()) {
      WOS_API.history.create({ type, category, icon: icon || '•', title, detail: detail || null, amount: amount !== undefined ? amount : null })
        .catch(() => {}); // silently ignore — localStorage is the fallback
    }
  };
})();
