
    // If already authenticated, skip login and go straight to the app
    if (WOS_API.isAuthenticated()) {
      WOS_API.auth.me()
        .then(() => {
          const dest = sessionStorage.getItem('wos_redirect') || 'index.html';
          sessionStorage.removeItem('wos_redirect');
          window.location.replace(dest);
        })
        .catch(() => WOS_API.clearToken()); // token expired — stay on login
    }

    let currentTab = 'signin';

    function showTab(tab) {
      currentTab = tab;
      document.getElementById('tab-signin').classList.toggle('auth-tab--active', tab === 'signin');
      document.getElementById('tab-signup').classList.toggle('auth-tab--active', tab === 'signup');
      document.getElementById('auth-submit').textContent = tab === 'signin' ? 'Sign In' : 'Create Account';
      // Show/hide confirm password field
      document.getElementById('field-confirm').style.display = tab === 'signup' ? 'block' : 'none';
      document.getElementById('auth-confirm').required = tab === 'signup';
      // Clear confirm field and errors when switching tabs
      document.getElementById('auth-confirm').value = '';
      document.getElementById('auth-confirm').classList.remove('auth-input--error');
      hideBanner();
    }

    function showBanner(msg, type) {
      const el = document.getElementById('auth-banner');
      el.textContent = msg;
      el.className = 'auth-banner auth-banner--' + type;
      el.style.display = 'block';
    }

    function hideBanner() {
      document.getElementById('auth-banner').style.display = 'none';
    }

    function showSignIn() {
      document.getElementById('confirm-screen').style.display = 'none';
      document.getElementById('auth-form').style.display = 'block';
      document.getElementById('auth-tabs').style.display = 'flex';
      showTab('signin');
    }

    async function submitForm(e) {
      e.preventDefault();
      const email    = document.getElementById('auth-email').value.trim();
      const password = document.getElementById('auth-password').value;
      const btn      = document.getElementById('auth-submit');

      hideBanner();

      // Client-side password match check for signup
      if (currentTab === 'signup') {
        const confirm = document.getElementById('auth-confirm').value;
        if (password !== confirm) {
          document.getElementById('auth-confirm').classList.add('auth-input--error');
          showBanner('Passwords do not match.', 'error');
          return;
        }
        document.getElementById('auth-confirm').classList.remove('auth-input--error');
      }

      btn.disabled    = true;
      btn.textContent = currentTab === 'signin' ? 'Signing in…' : 'Creating account…';

      try {
        if (currentTab === 'signin') {
          const res     = await WOS_API.auth.signin(email, password);
          const session = res.data.session;
          if (session?.access_token) {
            WOS_API.setToken(session.access_token);
            const dest = sessionStorage.getItem('wos_redirect') || 'index.html';
            sessionStorage.removeItem('wos_redirect');
            window.location.replace(dest);
          }
        } else {
          await WOS_API.auth.signup(email, password);
          // Show the confirmation screen
          document.getElementById('confirm-email').textContent = email;
          document.getElementById('auth-form').style.display  = 'none';
          document.getElementById('auth-tabs').style.display  = 'none';
          document.getElementById('confirm-screen').style.display = 'block';
        }
      } catch (err) {
        showBanner(err.message || 'Something went wrong. Please try again.', 'error');
      } finally {
        btn.disabled    = false;
        btn.textContent = currentTab === 'signin' ? 'Sign In' : 'Create Account';
      }
    }
  