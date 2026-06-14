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

  var HEADER_MENUS = [
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
    }
  ];

  var LIST_FILTER_MENUS = [
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

  function recipeMatchesMultiFilters(r, multi) {
    if (!multi) return true;
    var protein = multi.protein || [];
    var cuisine = multi.cuisine || [];
    if (protein.length) {
      var hasProtein = protein.some(function(tag) {
        return !!(r.tags && r.tags.indexOf(tag) !== -1);
      });
      if (!hasProtein) return false;
    }
    if (cuisine.length) {
      var hasCuisine = cuisine.some(function(id) {
        return recipeMatchesCuisine(r, id);
      });
      if (!hasCuisine) return false;
    }
    return true;
  }

  function filterMenus(recipes, menus) {
    return menus.map(function(menu) {
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

  function resetBrowsePanelStyles(root) {
    if (!root) return;
    root.querySelectorAll('.browse-menu .browse-panel').forEach(function(panel) {
      panel.style.position = '';
      panel.style.top = '';
      panel.style.left = '';
      panel.style.right = '';
      panel.style.width = '';
      panel.style.zIndex = '';
    });
  }

  function positionBrowsePanel(menu) {
    if (!window.matchMedia('(max-width: 720px)').matches) return;
    var panel = menu.querySelector('.browse-panel');
    var trigger = menu.querySelector('.browse-trigger');
    if (!panel || !trigger) return;
    var rect = trigger.getBoundingClientRect();
    var left = Math.max(12, Math.min(rect.left, window.innerWidth - 200));
    panel.style.position = 'fixed';
    panel.style.top = (rect.bottom + 6) + 'px';
    panel.style.left = left + 'px';
    panel.style.width = '';
    panel.style.right = 'auto';
    panel.style.zIndex = '60';
  }

  function closeAllMenus(root) {
    resetBrowsePanelStyles(root);
    root.querySelectorAll('.browse-menu.is-open, .list-filter-menu.is-open').forEach(function(el) {
      el.classList.remove('is-open');
      var btn = el.querySelector('.browse-trigger, .list-filter-trigger');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
  }

  function bindDropdownBehavior(root) {
    if (!root || root._browseBound) return;
    root._browseBound = true;
    var closeTimer = null;

    root.addEventListener('mouseover', function(e) {
      if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
      var menu = e.target.closest('.browse-menu, .list-filter-menu');
      if (!menu || !root.contains(menu)) return;
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
      closeAllMenus(root);
      menu.classList.add('is-open');
      if (menu.classList.contains('browse-menu')) positionBrowsePanel(menu);
      var btn = menu.querySelector('.browse-trigger, .list-filter-trigger');
      if (btn) btn.setAttribute('aria-expanded', 'true');
    });

    root.addEventListener('mouseout', function(e) {
      if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
      var menu = e.target.closest('.browse-menu, .list-filter-menu');
      if (!menu || !root.contains(menu)) return;
      if (e.relatedTarget && menu.contains(e.relatedTarget)) return;
      closeTimer = setTimeout(function() {
        menu.classList.remove('is-open');
        var btn = menu.querySelector('.browse-trigger, .list-filter-trigger');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      }, 140);
    });

    root.addEventListener('click', function(e) {
      var trigger = e.target.closest('.browse-trigger, .list-filter-trigger');
      if (trigger) {
        e.preventDefault();
        var menu = trigger.closest('.browse-menu, .list-filter-menu');
        var open = menu.classList.contains('is-open');
        closeAllMenus(root);
        if (!open) {
          menu.classList.add('is-open');
          if (menu.classList.contains('browse-menu')) positionBrowsePanel(menu);
          trigger.setAttribute('aria-expanded', 'true');
        }
        return;
      }
      if (e.target.closest('.browse-link')) closeAllMenus(root);
    });

    document.addEventListener('click', function(e) {
      if (!root.contains(e.target)) closeAllMenus(root);
    });

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeAllMenus(root);
    });

    window.addEventListener('resize', function() {
      closeAllMenus(root);
    });
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

  function listFilterTriggerLabel(menu, selected) {
    var values = selected[menu.id] || [];
    if (!values.length) return menu.label;
    var labels = [];
    menu.sections.forEach(function(section) {
      section.items.forEach(function(item) {
        if (values.indexOf(item.value) !== -1) labels.push(item.label);
      });
    });
    if (labels.length <= 2) return menu.label + ': ' + labels.join(', ');
    return menu.label + ' (' + labels.length + ')';
  }

  function listFilterChevron() {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'list-filter-chevron');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M6 9l6 6 6-6');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    return svg;
  }

  function renderListFilters(container, options) {
    options = options || {};
    var recipes = options.recipes || null;
    var activeMulti = options.activeMulti || { protein: [], cuisine: [] };
    var menus = filterMenus(recipes, LIST_FILTER_MENUS);
    container.replaceChildren();
    if (!menus.length) {
      container.hidden = true;
      return;
    }
    container.hidden = false;

    menus.forEach(function(menu) {
      var wrap = mk('div', 'list-filter-menu');
      var selected = activeMulti[menu.id] || [];
      var trigger = mk('button', 'list-filter-trigger');
      trigger.type = 'button';
      var triggerLabel = mk('span', 'list-filter-trigger-label');
      triggerLabel.textContent = listFilterTriggerLabel(menu, activeMulti);
      trigger.appendChild(triggerLabel);
      trigger.appendChild(listFilterChevron());
      trigger.setAttribute('aria-haspopup', 'true');
      trigger.setAttribute('aria-expanded', 'false');
      if (selected.length) trigger.classList.add('has-selection');
      wrap.appendChild(trigger);

      var panel = mk('div', 'list-filter-panel');
      var list = mk('ul', 'list-filter-options');
      menu.sections.forEach(function(section) {
        section.items.forEach(function(item) {
          var li = mk('li');
          var label = mk('label', 'list-filter-option');
          var input = document.createElement('input');
          input.type = 'checkbox';
          input.value = item.value;
          input.checked = selected.indexOf(item.value) !== -1;
          label.appendChild(input);
          var span = document.createElement('span');
          span.textContent = item.label;
          label.appendChild(span);
          li.appendChild(label);
          list.appendChild(li);

          input.addEventListener('change', function() {
            var next = {
              protein: (activeMulti.protein || []).slice(),
              cuisine: (activeMulti.cuisine || []).slice()
            };
            var bucket = next[menu.id] || [];
            if (input.checked) {
              if (bucket.indexOf(item.value) === -1) bucket.push(item.value);
            } else {
              bucket = bucket.filter(function(v) { return v !== item.value; });
            }
            next[menu.id] = bucket;
            if (options.onChange) options.onChange(next);
          });
        });
      });
      panel.appendChild(list);
      wrap.appendChild(panel);
      container.appendChild(wrap);
    });

    bindDropdownBehavior(container);
  }

  function render(nav, options) {
    options = options || {};
    var recipes = options.recipes || null;
    var activeFilter = options.activeFilter || { type: 'all', value: null };
    var linkMode = !!options.linkMode;
    var menus = filterMenus(recipes, HEADER_MENUS);
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
    allBtn.textContent = 'Alla';
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
    recipeMatchesMultiFilters: recipeMatchesMultiFilters,
    render: render,
    renderListFilters: renderListFilters
  };
})(window);
