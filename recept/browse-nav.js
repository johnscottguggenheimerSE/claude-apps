(function(global) {
  var CATEGORY_ORDER = ['frukost', 'lunch', 'middag', 'tillbehor', 'fika'];
  var CATEGORY_LABELS = {
    frukost: 'Frukost',
    lunch: 'Lunch',
    middag: 'Middag',
    tillbehor: 'Tillbehör',
    fika: 'Fika & bakning'
  };
  var TAG_LABELS = {
    'hog-protein': 'Hög protein',
    snabb: 'Snabbt (≤30 min)',
    vegetarisk: 'Vegetariskt',
    'meal-prep': 'Meal prep',
    kyckling: 'Kyckling',
    notkott: 'Nötkött',
    flask: 'Fläsk',
    fisk: 'Fisk',
    skaldjur: 'Skaldjur',
    laggkolhydrat: 'Lågkolhydrat'
  };

  var BROWSE_MENUS = [
    {
      id: 'meal',
      label: 'Måltid',
      sections: [{
        name: 'Efter måltid',
        items: CATEGORY_ORDER.map(function(cat) {
          return { type: 'category', value: cat, label: CATEGORY_LABELS[cat] };
        })
      }]
    },
    {
      id: 'diet',
      label: 'Diet & behov',
      sections: [{
        name: 'Passar när',
        items: ['hog-protein', 'snabb', 'laggkolhydrat', 'vegetarisk', 'meal-prep'].map(function(tag) {
          return { type: 'tag', value: tag, label: TAG_LABELS[tag] || tag };
        })
      }]
    },
    {
      id: 'protein',
      label: 'Protein',
      sections: [{
        name: 'Huvudingrediens',
        items: ['kyckling', 'notkott', 'flask', 'fisk', 'skaldjur'].map(function(tag) {
          return { type: 'tag', value: tag, label: TAG_LABELS[tag] || tag };
        })
      }]
    }
  ];

  function mk(tag, cls) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    return el;
  }

  function itemAvailable(recipes, item) {
    if (!recipes || !recipes.length) return true;
    if (item.type === 'category') {
      return recipes.some(function(r) { return r.category === item.value; });
    }
    if (item.type === 'tag') {
      return recipes.some(function(r) {
        return r.tags && r.tags.indexOf(item.value) !== -1;
      });
    }
    return false;
  }

  function filterMenus(recipes) {
    return BROWSE_MENUS.map(function(menu) {
      var sections = menu.sections.map(function(section) {
        var items = section.items.filter(function(item) {
          return itemAvailable(recipes, item);
        });
        return { name: section.name, items: items };
      }).filter(function(section) { return section.items.length; });
      return { id: menu.id, label: menu.label, sections: sections };
    }).filter(function(menu) { return menu.sections.length; });
  }

  function filtersEqual(a, b) {
    if (!a || !b) return false;
    return a.type === b.type && a.value === b.value;
  }

  function isAllFilter(filter) {
    return !filter || filter.type === 'all';
  }

  function isMenuActive(menu, activeFilter) {
    if (isAllFilter(activeFilter)) return false;
    for (var i = 0; i < menu.sections.length; i++) {
      var items = menu.sections[i].items;
      for (var j = 0; j < items.length; j++) {
        if (filtersEqual(items[j], activeFilter)) return true;
      }
    }
    return false;
  }

  function storeFilter(filter) {
    try {
      if (!filter || filter.type === 'all') sessionStorage.removeItem('recept_filter');
      else sessionStorage.setItem('recept_filter', JSON.stringify(filter));
    } catch (e) {}
  }

  function readStoredFilter() {
    try {
      var raw = sessionStorage.getItem('recept_filter');
      if (!raw) return null;
      sessionStorage.removeItem('recept_filter');
      return JSON.parse(raw);
    } catch (e) {}
    return null;
  }

  function filterLabel(filter) {
    if (isAllFilter(filter)) return 'Alla recept';
    if (filter.type === 'category') return CATEGORY_LABELS[filter.value] || filter.value;
    if (filter.type === 'tag') return TAG_LABELS[filter.value] || filter.value;
    return 'Alla recept';
  }

  function closeAllMenus(nav) {
    nav.querySelectorAll('.browse-menu.is-open').forEach(function(el) {
      el.classList.remove('is-open');
      var btn = el.querySelector('.browse-trigger');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
  }

  function bindDropdownBehavior(nav) {
    if (nav._browseBound) return;
    nav._browseBound = true;

    nav.addEventListener('click', function(e) {
      var trigger = e.target.closest('.browse-trigger');
      if (trigger) {
        e.preventDefault();
        var menu = trigger.closest('.browse-menu');
        var open = menu.classList.contains('is-open');
        closeAllMenus(nav);
        if (!open) {
          menu.classList.add('is-open');
          trigger.setAttribute('aria-expanded', 'true');
        }
        return;
      }
      var pick = e.target.closest('.browse-link');
      if (pick) {
        closeAllMenus(nav);
      }
    });

    document.addEventListener('click', function(e) {
      if (!nav.contains(e.target)) closeAllMenus(nav);
    });

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeAllMenus(nav);
    });
  }

  function renderPanel(section) {
    var block = mk('div', 'browse-section');
    var heading = mk('p', 'browse-section-name');
    heading.textContent = section.name;
    block.appendChild(heading);
    var list = mk('ul', 'browse-section-links');
    section.items.forEach(function(item) {
      var li = mk('li');
      var btn = mk('button', 'browse-link');
      btn.type = 'button';
      btn.textContent = item.label;
      btn._browseFilter = { type: item.type, value: item.value };
      li.appendChild(btn);
      list.appendChild(li);
    });
    block.appendChild(list);
    return block;
  }

  function render(nav, options) {
    options = options || {};
    var recipes = options.recipes || null;
    var activeFilter = options.activeFilter || { type: 'all', value: null };
    var linkMode = !!options.linkMode;
    var menus = filterMenus(recipes);
    nav.replaceChildren();
    bindDropdownBehavior(nav);

    function wirePick(el, filter) {
      if (linkMode) {
        el.addEventListener('click', function(e) {
          e.preventDefault();
          storeFilter(filter);
          location.href = '/';
        });
        return;
      }
      el.addEventListener('click', function() {
        if (options.onSelect) options.onSelect(filter);
      });
    }

    var allBtn = mk('button', 'browse-tab browse-tab-all');
    allBtn.type = 'button';
    allBtn.textContent = 'Alla recept';
    if (isAllFilter(activeFilter)) allBtn.classList.add('active');
    wirePick(allBtn, { type: 'all', value: null });
    nav.appendChild(allBtn);

    menus.forEach(function(menu) {
      var wrap = mk('div', 'browse-menu');
      var trigger = mk('button', 'browse-tab browse-trigger');
      trigger.type = 'button';
      trigger.textContent = menu.label;
      trigger.setAttribute('aria-haspopup', 'true');
      trigger.setAttribute('aria-expanded', 'false');
      if (isMenuActive(menu, activeFilter)) trigger.classList.add('active');
      wrap.appendChild(trigger);

      var panel = mk('div', 'browse-panel');
      menu.sections.forEach(function(section) {
        panel.appendChild(renderPanel(section));
      });
      wrap.appendChild(panel);
      nav.appendChild(wrap);

      panel.querySelectorAll('.browse-link').forEach(function(btn) {
        var filter = btn._browseFilter;
        if (filtersEqual(filter, activeFilter)) btn.classList.add('active');
        wirePick(btn, filter);
      });
    });
  }

  global.ReceptBrowseNav = {
    CATEGORY_ORDER: CATEGORY_ORDER,
    CATEGORY_LABELS: CATEGORY_LABELS,
    TAG_LABELS: TAG_LABELS,
    filterLabel: filterLabel,
    readStoredFilter: readStoredFilter,
    render: render
  };
})(window);
