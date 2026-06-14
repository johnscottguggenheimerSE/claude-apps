(function() {
  window.ReceptAdmin = { isAdmin: false };

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

  function adminLink(href, text, extraClass) {
    var a = document.createElement('a');
    a.href = href;
    a.className = 'admin-bar-link' + (extraClass ? ' ' + extraClass : '');
    a.textContent = text;
    return a;
  }

  function adminButton(text, onClick) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'admin-bar-btn';
    btn.textContent = text;
    btn.addEventListener('click', onClick);
    return btn;
  }

  function setAdminState(isAdmin) {
    window.ReceptAdmin.isAdmin = isAdmin;
    document.documentElement.classList.toggle('is-admin', isAdmin);
    window.dispatchEvent(new CustomEvent('recept-auth', { detail: { ok: isAdmin } }));
  }

  function renderAdminBar(bar, isAdmin) {
    bar.replaceChildren();
    if (isAdmin) {
      var page = document.body.getAttribute('data-page') || 'home';
      bar.appendChild(adminLink('/add/text', 'Lägg till +', page === 'add' ? 'is-current' : ''));
      bar.appendChild(adminButton('Logga ut', function() {
        fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
          .then(function() {
            setAdminState(false);
            renderAdminBar(bar, false);
            if (document.body.getAttribute('data-page') === 'add') {
              location.href = '/';
            }
          });
      }));
    } else {
      var next = encodeURIComponent(location.pathname + location.search);
      bar.appendChild(adminLink('/login.html?next=' + next, 'Logga in'));
    }
  }

  function initAdminBar() {
    var bar = document.querySelector('.admin-bar-inner');
    if (!bar) return;
    fetch('/api/auth/check', { credentials: 'same-origin' })
      .then(function(res) { return res.json(); })
      .then(function(d) {
        setAdminState(!!d.ok);
        renderAdminBar(bar, !!d.ok);
      })
      .catch(function() {
        setAdminState(false);
        renderAdminBar(bar, false);
      });
  }

  initAdminBar();

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
