(function() {
  var KEY = 'recept-theme';

  function systemTheme() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function getTheme() {
    var stored = localStorage.getItem(KEY);
    if (stored === 'light' || stored === 'dark') return stored;
    return systemTheme();
  }

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  apply(getTheme());

  window.ReceptTheme = {
    get: getTheme,
    set: function(theme) {
      if (theme !== 'light' && theme !== 'dark') return;
      localStorage.setItem(KEY, theme);
      apply(theme);
    },
    toggle: function() {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      this.set(next);
      return next;
    }
  };
})();
