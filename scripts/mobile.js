(function () {
  var hamburger = document.getElementById('hamburger-btn');
  var sidebar   = document.querySelector('.sidebar');
  var backdrop  = document.getElementById('sidebar-backdrop');

  if (!hamburger || !sidebar || !backdrop) return;

  function openSidebar() {
    sidebar.classList.add('sidebar--open');
    backdrop.classList.add('sidebar-backdrop--visible');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    sidebar.classList.remove('sidebar--open');
    backdrop.classList.remove('sidebar-backdrop--visible');
    document.body.style.overflow = '';
  }

  hamburger.addEventListener('click', openSidebar);
  backdrop.addEventListener('click', closeSidebar);

  // Close drawer when a nav link is tapped
  sidebar.querySelectorAll('.nav__item').forEach(function (link) {
    link.addEventListener('click', closeSidebar);
  });
})();
