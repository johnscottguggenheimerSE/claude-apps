(function() {
  function syncThemeToggle() {
    var label = document.getElementById('theme-toggle-label');
    if (!label) return;
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    label.textContent = dark ? 'Ljust' : 'Mörkt';
  }

  var themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) {
    themeBtn.addEventListener('click', function() {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (window.ReceptTheme) ReceptTheme.set(dark ? 'light' : 'dark');
      syncThemeToggle();
    });
    syncThemeToggle();
  }

  var logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function() {
      fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
        .then(function() { location.href = '/login.html'; });
    });
  }

  var page = document.body.getAttribute('data-page') || 'home';

  if (page === 'add') {
    var favBtn = document.getElementById('favorites-toggle-btn');
    if (favBtn) {
      favBtn.addEventListener('click', function() {
        try { sessionStorage.setItem('recept_show_favorites', '1'); } catch (e) {}
        location.href = '/';
      });
    }

    var search = document.getElementById('recipe-search');
    if (search) {
      search.addEventListener('keydown', function(e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        try { sessionStorage.setItem('recept_search', search.value.trim()); } catch (err) {}
        location.href = '/';
      });
    }

    var nav = document.getElementById('browse-nav');
    if (nav && window.ReceptBrowseNav && !nav.childNodes.length) {
      ReceptBrowseNav.render(nav, { linkMode: true });
    }
  }
})();
