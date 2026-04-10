// ─── WealthOS Auth Guard ──────────────────────────────────────────────────────
// Redirect-based page gate. Include on every protected page (after api.js).
// Unauthenticated users are sent to login.html; authenticated users get a
// sign-out button injected into the page.

(function () {

  // ─── Sign-out button ────────────────────────────────────────────────────────
  function injectSignOutButton() {
    if (document.getElementById('wos-signout-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'wos-signout-btn';
    btn.textContent = 'Sign Out';
    btn.style.cssText = [
      'position:fixed', 'bottom:20px', 'right:20px',
      'padding:8px 16px',
      'background:#1e2640', 'border:1px solid #2d3a54',
      'border-radius:8px', 'color:#8892a4',
      'font-size:13px', 'font-family:inherit',
      'cursor:pointer', 'z-index:9999', 'transition:all .15s',
    ].join(';');
    btn.onmouseenter = () => { btn.style.color = '#eef0ff'; };
    btn.onmouseleave = () => { btn.style.color = '#8892a4'; };
    btn.onclick = () => WOS_AUTH.signout();
    document.body.appendChild(btn);
  }

  // ─── Public auth controller ─────────────────────────────────────────────────
  window.WOS_AUTH = {
    signout() {
      try { WOS_API.auth.signout(); } catch (_) {}
      WOS_API.clearToken();
      [
        'wos-stocks', 'wos-bonos', 'wos-fondos', 'wos-fibras',
        'wos-retiro', 'wos-crypto', 'wos-bienes',
        'wealthos_accounts', 'wealthos_transactions', 'wealthos_history',
      ].forEach(k => localStorage.removeItem(k));
      window.location.replace('login.html');
    },
  };

  // ─── Gate ───────────────────────────────────────────────────────────────────
  if (!WOS_API.isAuthenticated()) {
    // Save current page so login can redirect back after success
    sessionStorage.setItem('wos_redirect', window.location.href);
    window.location.replace('login.html');
    return; // stop executing — page is about to unload
  }

  // Authenticated: inject sign-out button and silently validate token
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectSignOutButton);
  } else {
    injectSignOutButton();
  }

  WOS_API.auth.me().catch((err) => {
    if (err.status === 401) WOS_AUTH.signout();
  });

})();
