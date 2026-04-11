// ─── WealthOS Auth Guard ──────────────────────────────────────────────────────
// Redirect-based page gate. Include on every protected page (after api.js).
// Unauthenticated users are sent to login.html; authenticated users get a
// sign-out button injected into the page.

(function () {

  // ─── Sign-out label by browser language ─────────────────────────────────────
  const SIGNOUT_LABELS = {
    es: 'Cerrar Sesión',
    pt: 'Sair',
    fr: 'Se Déconnecter',
    de: 'Abmelden',
    it: 'Esci',
    zh: '退出登录',
    ja: 'ログアウト',
    ko: '로그아웃',
    ru: 'Выйти',
    ar: 'تسجيل الخروج',
  };
  function signOutLabel() {
    const lang = (navigator.language || 'en').slice(0, 2).toLowerCase();
    return SIGNOUT_LABELS[lang] || 'Sign Out';
  }

  // ─── Sign-out button ────────────────────────────────────────────────────────
  function injectSignOutButton() {
    if (document.getElementById('wos-signout-btn')) return;
    const footer = document.querySelector('.sidebar__footer');
    if (!footer) return;

    const btn = document.createElement('button');
    btn.id = 'wos-signout-btn';
    btn.textContent = signOutLabel();
    btn.style.cssText = [
      'display:flex', 'align-items:center', 'gap:8px',
      'width:calc(100% - 28px)', 'margin:0 14px 12px',
      'padding:9px 14px',
      'background:transparent', 'border:1px solid var(--border,#1e2640)',
      'border-radius:8px', 'color:var(--text-secondary,#8892a4)',
      'font-size:13px', 'font-family:inherit',
      'cursor:pointer', 'transition:all .15s', 'text-align:left',
    ].join(';');
    btn.innerHTML = `<span style="font-size:14px;opacity:.7">⎋</span> ${signOutLabel()}`;
    btn.onmouseenter = () => { btn.style.color = 'var(--text-primary,#eef0ff)'; btn.style.borderColor = 'rgba(99,102,241,0.4)'; };
    btn.onmouseleave = () => { btn.style.color = 'var(--text-secondary,#8892a4)'; btn.style.borderColor = 'var(--border,#1e2640)'; };
    btn.onclick = () => WOS_AUTH.signout();
    footer.parentNode.insertBefore(btn, footer.nextSibling);
  }

  // ─── Public auth controller ─────────────────────────────────────────────────
  window.WOS_AUTH = {
    signout() {
      try { WOS_API.auth.signout(); } catch (_) {}
      WOS_API.clearToken();
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
