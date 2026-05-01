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

  // ─── Sidebar name & avatar ──────────────────────────────────────────────────
  function updateSidebarName(fullName, initials) {
    const nameEl   = document.querySelector('.user__name');
    const avatarEl = document.querySelector('.user__avatar');
    if (nameEl   && fullName)  nameEl.textContent   = fullName;
    if (avatarEl && initials)  avatarEl.textContent = initials.toUpperCase().slice(0, 2);
  }

  function applyStoredName() {
    const name     = localStorage.getItem('wos_user_name');
    const initials = localStorage.getItem('wos_user_initials');
    if (name) updateSidebarName(name, initials || name.slice(0, 2));
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
      localStorage.removeItem('wos_user_name');
      localStorage.removeItem('wos_user_initials');
      window.location.replace('/login');
    },
  };

  // ─── Gate ───────────────────────────────────────────────────────────────────
  if (!WOS_API.isAuthenticated()) {
    // Save current page so login can redirect back after success
    sessionStorage.setItem('wos_redirect', window.location.href);
    window.location.replace('/login');
    return; // stop executing — page is about to unload
  }

  // Authenticated: inject sign-out button, apply cached name instantly
  function onReady() {
    injectSignOutButton();
    applyStoredName();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }

  // Silently validate token and refresh name from server
  WOS_API.auth.me()
    .then(res => {
      const meta     = res.data?.user?.user_metadata || {};
      const first    = (meta.first_name || '').trim();
      const last     = (meta.last_name  || '').trim();
      const fullName = [first, last].filter(Boolean).join(' ');
      const initials = ((first[0] || '') + (last[0] || '')).toUpperCase();
      if (fullName) {
        localStorage.setItem('wos_user_name',     fullName);
        localStorage.setItem('wos_user_initials', initials);
        updateSidebarName(fullName, initials);
      }
      // Capture today's account balances on every login (upsert — safe to call repeatedly)
      WOS_API.accounts.takeSnapshot().catch(() => {});
    })
    .catch(err => {
      if (err.status === 401) WOS_AUTH.signout();
    });

})();
