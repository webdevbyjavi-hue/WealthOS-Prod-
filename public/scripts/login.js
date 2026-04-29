
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
      document.getElementById('auth-submit').textContent = tab === 'signin' ? 'Iniciar Sesión' : 'Crear Cuenta';

      const isSignup = tab === 'signup';

      // Name fields
      document.getElementById('field-name').style.display         = isSignup ? 'block' : 'none';
      document.getElementById('auth-firstname').required          = isSignup;
      document.getElementById('auth-lastname').required           = isSignup;

      // Date of birth field
      document.getElementById('field-dob').style.display          = isSignup ? 'block' : 'none';

      // Confirm password field
      document.getElementById('field-confirm').style.display      = isSignup ? 'block' : 'none';
      document.getElementById('auth-confirm').required            = isSignup;

      // Clear fields and errors when switching tabs
      document.getElementById('auth-confirm').value  = '';
      document.getElementById('auth-firstname').value = '';
      document.getElementById('auth-lastname').value  = '';
      document.getElementById('auth-dob').value       = '';
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

      // Client-side validation for signup
      if (currentTab === 'signup') {
        const firstName = document.getElementById('auth-firstname').value.trim();
        const lastName  = document.getElementById('auth-lastname').value.trim();
        if (!firstName || !lastName) {
          showBanner('Por favor ingresa tu nombre y apellido.', 'error');
          return;
        }
        const confirm = document.getElementById('auth-confirm').value;
        if (password !== confirm) {
          document.getElementById('auth-confirm').classList.add('auth-input--error');
          showBanner('Las contraseñas no coinciden.', 'error');
          return;
        }
        document.getElementById('auth-confirm').classList.remove('auth-input--error');
      }

      btn.disabled    = true;
      btn.textContent = currentTab === 'signin' ? 'Iniciando sesión…' : 'Creando cuenta…';

      try {
        if (currentTab === 'signin') {
          const res     = await WOS_API.auth.signin(email, password);
          const session = res.data.session;
          if (session?.access_token) {
            WOS_API.setToken(session.access_token);
            // Cache display name for instant sidebar render
            const meta     = res.data.user?.user_metadata || {};
            const first    = (meta.first_name || '').trim();
            const last     = (meta.last_name  || '').trim();
            const fullName = [first, last].filter(Boolean).join(' ');
            if (fullName) {
              localStorage.setItem('wos_user_name',     fullName);
              localStorage.setItem('wos_user_initials', ((first[0] || '') + (last[0] || '')).toUpperCase());
            }
            const dest = sessionStorage.getItem('wos_redirect') || 'index.html';
            sessionStorage.removeItem('wos_redirect');
            window.location.replace(dest);
          } else {
            showBanner('Inicio de sesión exitoso pero no se encontró sesión. Verifica tu correo y haz clic en el enlace de confirmación antes de iniciar sesión.', 'error');
          }
        } else {
          const firstName = document.getElementById('auth-firstname').value.trim();
          const lastName  = document.getElementById('auth-lastname').value.trim();
          const dob       = document.getElementById('auth-dob').value || null;
          await WOS_API.auth.signup(email, password, firstName, lastName, dob);
          // Show the confirmation screen
          document.getElementById('confirm-email').textContent       = email;
          document.getElementById('auth-form').style.display         = 'none';
          document.getElementById('auth-tabs').style.display         = 'none';
          document.getElementById('confirm-screen').style.display    = 'block';
        }
      } catch (err) {
        showBanner(err.message || 'Algo salió mal. Por favor intenta de nuevo.', 'error');
      } finally {
        btn.disabled    = false;
        btn.textContent = currentTab === 'signin' ? 'Iniciar Sesión' : 'Crear Cuenta';
      }
    }
  