// ─── WealthOS Auth ────────────────────────────────────────────────────────────
// Injects a login/signup modal and gates every page behind authentication.
// Requires api.js to be loaded first.

(function () {
  // ─── Inject modal HTML ──────────────────────────────────────────────────────
  const modal = document.createElement('div');
  modal.id = 'wos-auth-modal';
  modal.innerHTML = `
    <div class="wos-auth-backdrop">
      <div class="wos-auth-card">
        <div class="wos-auth-logo">
          <span class="wos-auth-logo-icon">W</span>
          <span class="wos-auth-logo-text">WealthOS</span>
        </div>
        <div class="wos-auth-tabs">
          <button class="wos-auth-tab wos-auth-tab--active" onclick="WOS_AUTH.showTab('signin')">Sign In</button>
          <button class="wos-auth-tab" onclick="WOS_AUTH.showTab('signup')">Sign Up</button>
        </div>
        <form id="wos-auth-form" onsubmit="WOS_AUTH.submit(event)">
          <div class="wos-auth-field">
            <label class="wos-auth-label">Email</label>
            <input id="wos-auth-email" class="wos-auth-input" type="email" placeholder="you@example.com" required autocomplete="email" />
          </div>
          <div class="wos-auth-field">
            <label class="wos-auth-label">Password</label>
            <input id="wos-auth-password" class="wos-auth-input" type="password" placeholder="Min. 8 characters" required autocomplete="current-password" />
          </div>
          <div id="wos-auth-error" class="wos-auth-error" style="display:none"></div>
          <button type="submit" id="wos-auth-submit" class="wos-auth-btn">Sign In</button>
        </form>
      </div>
    </div>
  `;

  // ─── Inject styles ──────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    #wos-auth-modal { position:fixed; inset:0; z-index:99999; display:none; }
    #wos-auth-modal.visible { display:block; }
    .wos-auth-backdrop { position:absolute; inset:0; background:rgba(8,10,20,0.92); backdrop-filter:blur(6px); display:flex; align-items:center; justify-content:center; }
    .wos-auth-card { background:#111525; border:1px solid #1e2640; border-radius:16px; padding:36px 32px; width:100%; max-width:380px; box-shadow:0 24px 64px rgba(0,0,0,0.6); }
    .wos-auth-logo { display:flex; align-items:center; gap:10px; margin-bottom:28px; justify-content:center; }
    .wos-auth-logo-icon { width:36px; height:36px; background:linear-gradient(135deg,#6366f1,#8b5cf6); border-radius:8px; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:18px; color:#fff; }
    .wos-auth-logo-text { font-size:20px; font-weight:700; color:#eef0ff; letter-spacing:-0.3px; }
    .wos-auth-tabs { display:flex; gap:4px; background:#0d1226; border-radius:8px; padding:4px; margin-bottom:24px; }
    .wos-auth-tab { flex:1; padding:8px; border:none; border-radius:6px; background:transparent; color:#8892a4; font-size:14px; font-weight:500; cursor:pointer; transition:all .15s; }
    .wos-auth-tab--active { background:#1e2640; color:#eef0ff; }
    .wos-auth-field { margin-bottom:16px; }
    .wos-auth-label { display:block; font-size:12px; font-weight:500; color:#8892a4; margin-bottom:6px; text-transform:uppercase; letter-spacing:.6px; }
    .wos-auth-input { width:100%; padding:10px 12px; background:#0d1226; border:1px solid #1e2640; border-radius:8px; color:#eef0ff; font-size:14px; outline:none; box-sizing:border-box; transition:border-color .15s; }
    .wos-auth-input:focus { border-color:#6366f1; }
    .wos-auth-error { background:rgba(248,113,113,0.12); border:1px solid rgba(248,113,113,0.3); border-radius:8px; color:#f87171; font-size:13px; padding:10px 12px; margin-bottom:16px; }
    .wos-auth-btn { width:100%; padding:11px; background:#6366f1; border:none; border-radius:8px; color:#fff; font-size:14px; font-weight:600; cursor:pointer; transition:background .15s; margin-top:4px; }
    .wos-auth-btn:hover { background:#5254cc; }
    .wos-auth-btn:disabled { background:#2d3154; color:#8892a4; cursor:not-allowed; }
    #wos-signout-btn { display:none; }
  `;
  document.head.appendChild(style);
  document.body.appendChild(modal);

  // ─── Inject sign-out button into nav (if nav exists) ───────────────────────
  const nav = document.querySelector('nav, .nav, .sidebar, header');
  if (nav) {
    const btn = document.createElement('button');
    btn.id        = 'wos-signout-btn';
    btn.textContent = 'Sign Out';
    btn.style.cssText = 'position:fixed;bottom:20px;right:20px;padding:8px 16px;background:#1e2640;border:1px solid #2d3a54;border-radius:8px;color:#8892a4;font-size:13px;cursor:pointer;z-index:9999;transition:all .15s;';
    btn.onmouseenter = () => btn.style.color = '#eef0ff';
    btn.onmouseleave = () => btn.style.color = '#8892a4';
    btn.onclick      = () => WOS_AUTH.signout();
    document.body.appendChild(btn);
  }

  let currentTab = 'signin';

  // ─── Public auth controller ─────────────────────────────────────────────────
  window.WOS_AUTH = {
    show() {
      modal.classList.add('visible');
      document.body.style.overflow = 'hidden';
    },
    hide() {
      modal.classList.remove('visible');
      document.body.style.overflow = '';
      // Show sign-out button
      const so = document.getElementById('wos-signout-btn');
      if (so) so.style.display = 'block';
    },
    showTab(tab) {
      currentTab = tab;
      document.querySelectorAll('.wos-auth-tab').forEach((el, i) => {
        el.classList.toggle('wos-auth-tab--active', (i === 0 && tab === 'signin') || (i === 1 && tab === 'signup'));
      });
      document.getElementById('wos-auth-submit').textContent = tab === 'signin' ? 'Sign In' : 'Create Account';
      document.getElementById('wos-auth-error').style.display = 'none';
    },
    async submit(e) {
      e.preventDefault();
      const email    = document.getElementById('wos-auth-email').value.trim();
      const password = document.getElementById('wos-auth-password').value;
      const errEl    = document.getElementById('wos-auth-error');
      const btn      = document.getElementById('wos-auth-submit');

      errEl.style.display = 'none';
      btn.disabled        = true;
      btn.textContent     = currentTab === 'signin' ? 'Signing in…' : 'Creating account…';

      try {
        let session;
        if (currentTab === 'signin') {
          const res = await WOS_API.auth.signin(email, password);
          session   = res.data.session;
        } else {
          const res = await WOS_API.auth.signup(email, password);
          session   = res.data.session;
        }

        if (session?.access_token) {
          WOS_API.setToken(session.access_token);
          WOS_AUTH.hide();
          // Trigger a sync so data loads immediately after login
          if (typeof WOS_SYNC !== 'undefined') WOS_SYNC.run();
        } else {
          // Signup succeeded but email confirmation may be required
          errEl.textContent    = 'Account created! Check your email to confirm, then sign in.';
          errEl.style.display  = 'block';
          errEl.style.color    = '#34d399';
          errEl.style.background = 'rgba(52,211,153,0.1)';
          errEl.style.borderColor = 'rgba(52,211,153,0.3)';
          WOS_AUTH.showTab('signin');
        }
      } catch (err) {
        errEl.textContent   = err.message || 'Something went wrong.';
        errEl.style.display = 'block';
        errEl.style.color   = '#f87171';
        errEl.style.background = 'rgba(248,113,113,0.12)';
        errEl.style.borderColor = 'rgba(248,113,113,0.3)';
      } finally {
        btn.disabled    = false;
        btn.textContent = currentTab === 'signin' ? 'Sign In' : 'Create Account';
      }
    },
    async signout() {
      try { await WOS_API.auth.signout(); } catch (_) {}
      WOS_API.clearToken();
      // Clear cached data
      ['wos-stocks','wos-bonos','wos-fondos','wos-fibras','wos-retiro','wos-crypto','wos-bienes','wealthos_accounts','wealthos_transactions','wealthos_history'].forEach(k => localStorage.removeItem(k));
      WOS_AUTH.show();
      const so = document.getElementById('wos-signout-btn');
      if (so) so.style.display = 'none';
    },
  };

  // ─── Gate page on auth ──────────────────────────────────────────────────────
  // Runs immediately — if no token exists, show the modal.
  // If a token exists, validate it silently in the background.
  if (!WOS_API.isAuthenticated()) {
    WOS_AUTH.show();
  } else {
    // Show sign-out button for authenticated users
    setTimeout(() => {
      const so = document.getElementById('wos-signout-btn');
      if (so) so.style.display = 'block';
    }, 100);
    // Silently validate token in background; log out if expired
    WOS_API.auth.me().catch((err) => {
      if (err.status === 401) WOS_AUTH.signout();
    });
  }
})();
