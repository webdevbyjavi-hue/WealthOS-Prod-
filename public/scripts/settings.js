  document.getElementById('current-date').textContent =
    new Date().toLocaleDateString(window.WOS_LOCALE || 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // Set language selector to current language
  const langSel = document.getElementById('lang-select');
  if (langSel) langSel.value = window.WOS_LANG || 'en';

  function changeLanguage(lang) {
    localStorage.setItem('wos-lang', lang);
    location.reload();
  }

  // ─── Tab switching ───────────────────────────────────────────
  // Maps each tab name → section IDs to show
  const TAB_MAP = {
    profile:       ['profile', 'delete-account'],
    portfolio:     ['portfolio'],
    display:       ['display'],
    notifications: ['notifications'],
    privacy:       ['privacy'],
    integrations:  ['integrations'],
  };

  const tabs     = document.querySelectorAll('.settings-nav__item[data-tab]');
  const sections = document.querySelectorAll('.settings-section[id]');

  function showTab(tabName) {
    const toShow = TAB_MAP[tabName] || [];

    tabs.forEach(t =>
      t.classList.toggle('settings-nav__item--active', t.dataset.tab === tabName)
    );
    sections.forEach(s =>
      s.classList.toggle('settings-section--hidden', !toShow.includes(s.id))
    );
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', e => {
      e.preventDefault();
      showTab(tab.dataset.tab);
    });
  });

  // Start on profile tab
  showTab('profile');
