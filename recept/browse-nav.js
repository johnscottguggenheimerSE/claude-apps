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
    kyckling: 'Kyckling',
    notkott: 'Nötkött',
    flask: 'Fläsk',
    skaldjur: 'Skaldjur',
    vegetarisk: 'Vegetariskt',
    fisk: 'Fisk'
  };
  var DIET_LABELS = {
    all: 'Allt',
    fisk: 'Fisk',
    vegetarisk: 'Vegetarian',
    vegan: 'Vegan'
  };
  var CUISINE_LABELS = {
    asiatiskt: 'Asiatiskt',
    kinesiskt: 'Kinesiskt',
    japanskt: 'Japanskt',
    koreanskt: 'Koreanskt',
    thailandskt: 'Thailändskt',
    mexikanskt: 'Mexikanskt',
    amerikanskt: 'Amerikanskt',
    vietnamesiskt: 'Vietnamesiskt',
    mellanostern: 'Mellanöstern'
  };
  var CUISINE_ORDER = [
    'asiatiskt', 'kinesiskt', 'japanskt', 'koreanskt', 'thailandskt',
    'mexikanskt', 'amerikanskt', 'vietnamesiskt', 'mellanostern'
  ];
  var RECIPE_CUISINE = {
    'buffalo-chicken-crust-pizza': ['amerikanskt'],
    'chicken-kebab-wraps': ['mellanostern'],
    'cinnamon-sugar-donut-holes': ['amerikanskt'],
    'dumpling-lasagna': ['kinesiskt'],
    'edamame-spread': ['japanskt'],
    'gochujang-gnocchi': ['koreanskt'],
    'hoagie-brod': ['amerikanskt'],
    'honey-lime-teriyaki-beef-noodles': ['japanskt'],
    'hot-honey-chicken-sliders': ['amerikanskt'],
    'mexican-chicken-corn-salad': ['mexikanskt'],
    'numbing-chicken-cucumber': ['kinesiskt'],
    'one-pan-dumplings-with-greens': ['kinesiskt'],
    'rice-paper-shrimp-pancake': ['vietnamesiskt'],
    'smashed-cucumber': ['japanskt'],
    'smashed-pickle-salad': ['amerikanskt'],
    'thai-basil-beef-rolls': ['thailandskt'],
    'tuna-chili-crisp-salad': ['asiatiskt']
  };
  var ANIMAL_INGREDIENT = /kyckling|nötkött|nötfärs|malet nötkött|fläsk|tonfisk|räkor|ägg|keso|ost|grädd|majonnäs|honung|smör|mjölk|yoghurt|fisk|skaldjur|biff|fläskkött|kycklingbröst|kycklingfärs|ventresca|malet fläsk/i;

  var BROWSE_MENUS = [
    {
      id: 'type',
      label: 'Typ',
      sections: [{
        name: '',
        items: CATEGORY_ORDER.map(function(cat) {
          return { type: 'category', value: cat, label: CATEGORY_LABELS[cat] };
        })
      }]
    },
    {
      id: 'diet',
      label: 'Diet',
      sections: [{
        name: '',
        items: [
          { type: 'all', value: null, label: 'Allt' },
          { type: 'diet', value: 'fisk', label: 'Fisk' },
          { type: 'diet', value: 'vegetarisk', label: 'Vegetarian' },
          { type: 'diet', value: 'vegan', label: 'Vegan' }
        ]
      }]
    },
    {
      id: 'protein',
      label: 'Proteinkälla',
      sections: [{
        name: '',
        items: ['kyckling', 'notkott', 'flask', 'skaldjur'].map(function(tag) {
          return { type: 'tag', value: tag, label: TAG_LABELS[tag] || tag };
        })
      }]
    },
    {
      id: 'cuisine',
      label: 'Kök',
      sections: [{
        name: '',
        items: CUISINE_ORDER.map(function(id) {
          return { type: 'cuisine', value: id, label: CUISINE_LABELS[id] };
        })
      }]
    }
  ];

  function mk(tag, cls) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    return el;
  }

  function recipeCuisines(r) {
    if (RECIPE_CUISINE[r.id]) return RECIPE_CUISINE[r.id].slice();
    return [];
  }

  function recipeIsVegan(r) {
    if (r.tags && r.tags.indexOf('vegan') !== -1) return true;
    var groups = r.groups || [];
    for (var g = 0; g < groups.length; g++) {
      var ings = groups[g].ingredients || [];
      for (var i = 0; i < ings.length; i++) {
        if (ANIMAL_INGREDIENT.test(ings[i].name || '')) return false;
      }
    }
    return !!(r.tags && r.tags.indexOf('vegetarisk') !== -1) || groups.length > 0;
  }

  function recipeMatchesDiet(r, value) {
    if (value === 'fisk') {
      return !!(r.tags && (r.tags.indexOf('fisk') !== -1 || r.tags.indexOf('skaldjur') !== -1));
    }
    if (value === 'vegetarisk') {
      return !!(r.tags && r.tags.indexOf('vegetarisk') !== -1);
    }
    if (value === 'vegan') return recipeIsVegan(r);
    return false;
  }

  function recipeMatchesCuisine(r, value) {
    var cuisines = recipeCuisines(r);
    if (value === 'asiatiskt') {
      return cuisines.some(function(c) {
        return c === 'asiatiskt' || c === 'kinesiskt' || c === 'japanskt' ||
          c === 'koreanskt' || c === 'thailandskt' || c === 'vietnamesiskt';
      });
    }
    return cuisines.indexOf(value) !== -1;
  }

  function recipeMatchesFilter(r, filter) {
    if (!filter || filter.type === 'all') return true;
    if (filter.type === 'category') return r.category === filter.value;
    if (filter.type === 'tag') {
      return !!(r.tags && r.tags.indexOf(filter.value) !== -1);
    }
    if (filter.type === 'diet') return recipeMatchesDiet(r, filter.value);
    if (filter.type === 'cuisine') return recipeMatchesCuisine(r, filter.value);
    return true;
  }

  function itemAvailable(recipes, item) {
    if (item.type === 'all') return true;
    if (!recipes || !recipes.length) return true;
    if (item.type === 'category') {
      return recipes.some(function(r) { return r.category === item.value; });
    }
    if (item.type === 'tag') {
      return recipes.some(function(r) {
        return r.tags && r.tags.indexOf(item.value) !== -1;
      });
    }
    if (item.type === 'diet') {
      return recipes.some(function(r) { return recipeMatchesDiet(r, item.value); });
    }
    if (item.type === 'cuisine') {
      return recipes.some(function(r) { return recipeMatchesCuisine(r, item.value); });
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
    if (a.type === 'all' && b.type === 'all') return true;
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
        var item = items[j];
        if (filtersEqual({ type: item.type, value: item.value }, activeFilter)) return true;
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
    if (filter.type === 'diet') return DIET_LABELS[filter.value] || filter.value;
    if (filter.type === 'cuisine') return CUISINE_LABELS[filter.value] || filter.value;
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
    if (!nav._browseBound) {
      nav._browseBound = true;
      var closeTimer = null;

      nav.addEventListener('mouseover', function(e) {
        if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
        var menu = e.target.closest('.browse-menu');
        if (!menu || !nav.contains(menu)) return;
        if (closeTimer) {
          clearTimeout(closeTimer);
          closeTimer = null;
        }
        closeAllMenus(nav);
        menu.classList.add('is-open');
        var btn = menu.querySelector('.browse-trigger');
        if (btn) btn.setAttribute('aria-expanded', 'true');
      });

      nav.addEventListener('mouseout', function(e) {
        if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
        var menu = e.target.closest('.browse-menu');
        if (!menu || !nav.contains(menu)) return;
        if (e.relatedTarget && menu.contains(e.relatedTarget)) return;
        closeTimer = setTimeout(function() {
          menu.classList.remove('is-open');
          var btn = menu.querySelector('.browse-trigger');
          if (btn) btn.setAttribute('aria-expanded', 'false');
        }, 140);
      });

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
        if (e.target.closest('.browse-link')) closeAllMenus(nav);
      });

      document.addEventListener('click', function(e) {
        if (!nav.contains(e.target)) closeAllMenus(nav);
      });

      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeAllMenus(nav);
      });
    }
  }

  function renderPanel(section) {
    var block = mk('div', 'browse-section');
    if (section.name) {
      var heading = mk('p', 'browse-section-name');
      heading.textContent = section.name;
      block.appendChild(heading);
    }
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
      var panelInner = mk('div', 'browse-panel-inner');
      menu.sections.forEach(function(section) {
        panelInner.appendChild(renderPanel(section));
      });
      panel.appendChild(panelInner);
      wrap.appendChild(panel);
      nav.appendChild(wrap);

      panel.querySelectorAll('.browse-link').forEach(function(btn) {
        var filter = btn._browseFilter;
        if (filtersEqual(filter, activeFilter)) btn.classList.add('active');
        wirePick(btn, filter);
      });
    });
    bindDropdownBehavior(nav);
  }

  global.ReceptBrowseNav = {
    CATEGORY_ORDER: CATEGORY_ORDER,
    CATEGORY_LABELS: CATEGORY_LABELS,
    TAG_LABELS: TAG_LABELS,
    filterLabel: filterLabel,
    readStoredFilter: readStoredFilter,
    recipeMatchesFilter: recipeMatchesFilter,
    render: render
  };
})(window);
