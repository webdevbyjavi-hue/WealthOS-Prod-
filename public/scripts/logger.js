// ─── WealthOS Event Logger ───────────────────────────────────────────────────
// Shared utility. Include before any page script that calls logEvent().
// Posts events directly to the API (fire-and-forget). No localStorage.

(function () {
  window.logEvent = function ({ type, category, icon, title, detail, amount }) {
    if (typeof WOS_API === 'undefined' || !WOS_API.isAuthenticated()) return;
    WOS_API.history.create({
      type,
      category,
      icon:   icon  || '•',
      title,
      detail: detail || null,
      amount: amount !== undefined ? amount : null,
    }).catch(() => {}); // fire-and-forget — UI already reflects the action
  };
})();
