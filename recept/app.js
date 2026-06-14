const CATEGORY_ORDER = ['frukost', 'lunch', 'middag', 'tillbehor', 'fika'];
const CATEGORY_LABELS = {
  frukost: 'Frukost',
  lunch: 'Lunch',
  middag: 'Middag',
  tillbehor: 'Tillbehör',
  fika: 'Fika & bakning'
};

var TAG_FILTER_ORDER = [
  'hog-protein', 'snabb', 'laggkolhydrat', 'vegetarisk', 'meal-prep',
  'kyckling', 'notkott', 'flask', 'fisk', 'skaldjur'
];
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

if (!Element.prototype.replaceChildren) {
  Element.prototype.replaceChildren = function() {
    while (this.firstChild) this.removeChild(this.firstChild);
    for (var i = 0; i < arguments.length; i++) this.appendChild(arguments[i]);
  };
}

var BASE_PATH = (function() {
  var path = location.pathname;
  var idx = path.indexOf('/recept');
  if (idx !== -1) return path.slice(0, idx + 7) + '/';
  if (path.endsWith('/')) return path;
  if (/\.html$/i.test(path)) return path.replace(/[^/]+$/, '');
  return '/';
})();

var RECEPT_COOKIE_PATH = (function() {
  var path = location.pathname;
  var idx = path.indexOf('/recept');
  if (idx <= 0) return '/';
  return path.slice(0, idx) || '/';
})();

function assetUrl(path) {
  if (!path || /^https?:\/\//i.test(path)) return path;
  if (path.indexOf('/api/') === 0) return location.origin + path;
  var dir = BASE_PATH;
  if (dir.slice(-1) !== '/') dir += '/';
  var tail = path.replace(/^\//, '');
  return location.origin + dir + tail;
}

function recipeHash(id) {
  return '#' + encodeURIComponent(id);
}

function recipeLink(id) {
  return BASE_PATH + recipeHash(id);
}

function addPageUrl(editId) {
  var base = BASE_PATH;
  if (!base.endsWith('/')) base += '/';
  var path = base === '/' ? '/add' : base + 'add';
  if (!editId) return path;
  return path + '?edit=' + encodeURIComponent(editId);
}

var FEATURED_NEW_IDS = [];
var VISIT_COOKIE_NAME = 'recept_seen_new';
var VISIT_COOKIE_MAX_AGE = String(365 * 24 * 60 * 60);

function getSeenRecipeIds() {
  try {
    var parts = document.cookie.split(';');
    for (var i = 0; i < parts.length; i++) {
      var s = parts[i].trim();
      if (s.indexOf(VISIT_COOKIE_NAME + '=') === 0) {
        return JSON.parse(decodeURIComponent(s.slice(VISIT_COOKIE_NAME.length + 1)));
      }
    }
  } catch (e) {}
  return {};
}

function markRecipeVisited(id) {
  if (FEATURED_NEW_IDS.indexOf(id) === -1) return;
  var seen = getSeenRecipeIds();
  seen[id] = 1;
  document.cookie = VISIT_COOKIE_NAME + '=' + encodeURIComponent(JSON.stringify(seen)) + ';path=' + RECEPT_COOKIE_PATH + ';max-age=' + VISIT_COOKIE_MAX_AGE + ';SameSite=Lax';
}

function shouldShowNewBadge(id) {
  if (FEATURED_NEW_IDS.indexOf(id) === -1) return false;
  return !getSeenRecipeIds()[id];
}

function sortRecipesForList(filtered) {
  var seen = getSeenRecipeIds();
  var order = {};
  recipes.forEach(function(r, i) { order[r.id] = i; });
  var head = [];
  FEATURED_NEW_IDS.forEach(function(fid) {
    if (seen[fid]) return;
    for (var j = 0; j < filtered.length; j++) {
      if (filtered[j].id === fid) {
        head.push(filtered[j]);
        return;
      }
    }
  });
  var inHead = {};
  head.forEach(function(r) { inHead[r.id] = 1; });
  var tail = filtered.filter(function(r) { return !inHead[r.id]; });
  tail.sort(function(a, b) { return order[a.id] - order[b.id]; });
  return head.concat(tail);
}

function getRecipeIdFromHash() {
  var raw = (location.hash || '').replace(/^#/, '');
  if (!raw) return null;
  try { return decodeURIComponent(raw); } catch (e) { return raw; }
}

function setListUrl(replace) {
  var url = BASE_PATH + location.search;
  if (replace) history.replaceState({ view: 'list' }, '', url);
  else history.pushState({ view: 'list' }, '', url);
  document.title = 'Proteinrika recept';
}

function setRecipeUrl(id, replace) {
  var url = recipeLink(id) + location.search;
  if (replace) history.replaceState({ view: 'recipe', id: id }, '', url);
  else history.pushState({ view: 'recipe', id: id }, '', url);
}

var recipes = [];
var activeCategory = 'all';
var activeTagFilters = [];
var currentServings = 1;
var currentId = null;

function fmt(val, unit) {
  if (unit === 'g') return Math.round(val) + 'g';
  if (unit === 'msk') return (val % 1 === 0 ? val : val.toFixed(1)) + ' msk';
  if (unit === 'tsk') {
    if (val < 0.4) return '¼ tsk';
    if (val < 0.7) return '½ tsk';
    if (val < 1.4) return '1 tsk';
    return Math.round(val) + ' tsk';
  }
  if (unit === 'st') return (val % 1 === 0 ? Math.round(val) : val) + ' st';
  if (unit === 'pinch') return 'en nypa';
  if (unit === 'näve') return '1 näve';
  if (unit === 'strimlor') return Math.round(val) + ' strimlor';
  return Math.round(val) + ' ' + unit;
}

function mk(tag, cls) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function categoryLabel(key) {
  return CATEGORY_LABELS[key] || key;
}

function renderCategoryNav() {
  var nav = document.getElementById('cat-nav');
  nav.replaceChildren();
  if (activeCategory !== 'all' && !recipes.some(function(r) { return r.category === activeCategory; })) {
    activeCategory = 'all';
  }
  var allBtn = mk('button', 'cat-pill');
  allBtn.type = 'button';
  allBtn.textContent = 'Alla';
  if (activeCategory === 'all') allBtn.classList.add('active');
  allBtn.addEventListener('click', function() {
    activeCategory = 'all';
    renderCategoryNav();
    renderList();
  });
  nav.appendChild(allBtn);
  CATEGORY_ORDER.forEach(function(cat) {
    var has = recipes.some(function(r) { return r.category === cat; });
    if (!has) return;
    var btn = mk('button', 'cat-pill');
    btn.type = 'button';
    btn.textContent = categoryLabel(cat);
    if (activeCategory === cat) btn.classList.add('active');
    btn.addEventListener('click', function() {
      activeCategory = cat;
      renderCategoryNav();
      renderList();
    });
    nav.appendChild(btn);
  });
  renderTagNav();
}

function recipeHasAllActiveTags(r) {
  if (!activeTagFilters.length) return true;
  var rt = r.tags;
  if (!rt || !rt.length) return false;
  for (var i = 0; i < activeTagFilters.length; i++) {
    if (rt.indexOf(activeTagFilters[i]) === -1) return false;
  }
  return true;
}

function tagIdsInUse() {
  var counts = {};
  recipes.forEach(function(r) {
    if (!r.tags) return;
    r.tags.forEach(function(t) {
      if (TAG_FILTER_ORDER.indexOf(t) !== -1) counts[t] = 1;
    });
  });
  return TAG_FILTER_ORDER.filter(function(t) { return counts[t]; });
}

function renderTagNav() {
  var nav = document.getElementById('tag-nav');
  if (!nav) return;
  nav.replaceChildren();
  tagIdsInUse().forEach(function(tagId) {
    var btn = mk('button', 'tag-pill');
    btn.type = 'button';
    btn.textContent = TAG_LABELS[tagId] || tagId;
    if (activeTagFilters.indexOf(tagId) !== -1) btn.classList.add('active');
    btn.addEventListener('click', function() {
      var ix = activeTagFilters.indexOf(tagId);
      if (ix === -1) activeTagFilters.push(tagId);
      else activeTagFilters.splice(ix, 1);
      renderTagNav();
      renderList();
    });
    nav.appendChild(btn);
  });
  var clearBtn = mk('button', 'tag-pill tag-clear');
  clearBtn.type = 'button';
  clearBtn.textContent = 'Rensa taggar';
  clearBtn.disabled = activeTagFilters.length === 0;
  clearBtn.addEventListener('click', function() {
    if (!activeTagFilters.length) return;
    activeTagFilters.length = 0;
    renderTagNav();
    renderList();
  });
  nav.appendChild(clearBtn);
}

function inferBaseServingsFromBadges(r) {
  if (!r.badges) return 1;
  for (var i = 0; i < r.badges.length; i++) {
    var b = r.badges[i].toLowerCase();
    var m = b.match(/(\d+(?:[–-]\d+)?)\s*portioner/);
    if (m) {
      var parts = m[1].split(/[–-]/);
      if (parts.length === 2) return Math.round((parseInt(parts[0], 10) + parseInt(parts[1], 10)) / 2);
      return parseInt(parts[0], 10);
    }
    m = b.match(/(?:ca\s+)?(\d+)\s*(?:sliders|pizza|bollar|runda\s+bullar|bullar|wraps)/);
    if (m) return parseInt(m[1], 10);
    m = b.match(/1\s*pannkaka/);
    if (m) return 1;
  }
  return 1;
}

function getBaseServings(r) {
  if (r.baseServings && r.baseServings > 0) return r.baseServings;
  return inferBaseServingsFromBadges(r);
}

function servingScale(r) {
  return currentServings / getBaseServings(r);
}

function badgeTime(r) {
  if (!r.badges) return '';
  for (var i = 0; i < r.badges.length; i++) {
    var b = r.badges[i];
    if (/kcal|protein/i.test(b)) continue;
    if (/^(ca\s+)?(under\s+)?\d+([–-]\d+)?\s*min$/i.test(b)) return b;
  }
  for (var j = 0; j < r.badges.length; j++) {
    var b2 = r.badges[j];
    if (/kcal|protein/i.test(b2)) continue;
    var tm = b2.match(/((?:ca\s+)?(?:under\s+)?\d+(?:[–-]\d+)?\s*min)/i);
    if (tm) return tm[1];
  }
  return '';
}

function cardMetricTags(r) {
  var tags = [];
  if (r.macros) {
    var n = getBaseServings(r);
    tags.push(Math.round(r.macros.kcal / n) + ' kcal/port');
    tags.push(Math.round(r.macros.prot / n) + 'g protein/port');
  }
  var time = badgeTime(r);
  if (time) tags.push(time);
  return tags;
}

function appendMetricTags(parent, tags, tagClass) {
  if (!tags.length) return;
  tags.forEach(function(text) {
    var tag = mk('span', tagClass);
    tag.textContent = text;
    parent.appendChild(tag);
  });
}

function buildDetailHero(r, opts) {
  opts = opts || {};
  var hero = mk('div', 'detail-hero');
  if (r.image) {
    hero.classList.add('detail-hero--photo');
    hero.style.backgroundImage = "url('" + assetUrl(r.image) + "')";
  }
  var heroTags = mk('div', 'detail-hero-tags');
  appendMetricTags(heroTags, cardMetricTags(r), 'detail-hero-tag');
  if (heroTags.childNodes.length) hero.appendChild(heroTags);
  if (opts && opts.includeTitle === false) return hero;
  var title = document.createElement('h1');
  title.className = 'detail-hero-title';
  title.textContent = r.title;
  hero.appendChild(title);
  return hero;
}

function createRecipeCard(r) {
  var card = mk('a', 'recipe-card');
  card.href = recipeLink(r.id);
  if (r.image) {
    card.style.backgroundImage = "url('" + assetUrl(r.image) + "')";
  }
  var tagsWrap = mk('div', 'recipe-card-tags');
  appendMetricTags(tagsWrap, cardMetricTags(r), 'recipe-card-tag');
  if (tagsWrap.childNodes.length) card.appendChild(tagsWrap);
  if (shouldShowNewBadge(r.id)) {
    var newLbl = mk('span', 'recipe-card-new');
    newLbl.textContent = 'Nytt!';
    card.appendChild(newLbl);
  }
  var title = document.createElement('h2');
  title.className = 'recipe-card-title';
  title.textContent = r.title;
  card.appendChild(title);
  card.addEventListener('click', function(e) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    showDetail(r.id);
  });
  return card;
}

function renderList() {
  var container = document.getElementById('recipe-list');
  container.replaceChildren();
  var list = recipes;
  if (activeCategory !== 'all') {
    list = recipes.filter(function(r) { return r.category === activeCategory; });
  }
  list = list.filter(recipeHasAllActiveTags);
  list = sortRecipesForList(list);
  var grid = mk('div', 'recipe-grid');
  list.forEach(function(r) { grid.appendChild(createRecipeCard(r)); });
  container.appendChild(grid);
}

function showList(skipHistory) {
  document.getElementById('view-list').classList.remove('hidden');
  document.getElementById('view-detail').classList.add('hidden');
  currentId = null;
  if (!skipHistory) setListUrl(false);
  else setListUrl(true);
  window.scrollTo(0, 0);
  renderList();
}

document.getElementById('back-btn').addEventListener('click', function() {
  if (history.length > 1) history.back();
  else showList();
});

function applyServingsScale() {
  var r = recipes.find(function(x) { return x.id === currentId; });
  if (!r) return;
  var scale = servingScale(r);
  document.getElementById('serv-val').textContent = String(currentServings);
  document.getElementById('m-kcal').textContent = Math.round(r.macros.kcal * scale);
  document.getElementById('m-prot').textContent = Math.round(r.macros.prot * scale) + 'g';
  document.getElementById('m-carb').textContent = Math.round(r.macros.carb * scale) + 'g';
  document.getElementById('m-fat').textContent = Math.round(r.macros.fat * scale) + 'g';
  document.querySelectorAll('.ing-amt').forEach(function(el) {
    el.textContent = fmt(parseFloat(el.dataset.base) * scale, el.dataset.unit);
  });
}

function changeServings(d) {
  currentServings = Math.max(1, currentServings + d);
  applyServingsScale();
}

function showDetail(id, skipHistory) {
  var r = recipes.find(function(x) { return x.id === id; });
  if (!r) return;
  markRecipeVisited(id);
  currentId = id;
  document.title = r.title + ' — Proteinrika recept';
  if (!skipHistory) setRecipeUrl(id, false);
  else setRecipeUrl(id, true);
  var editLink = document.getElementById('detail-edit-link');
  if (editLink) editLink.href = addPageUrl(id);
  currentServings = getBaseServings(r);
  var c = document.getElementById('detail-content');
  c.replaceChildren();
  var top = mk('div', 'detail-top');
  top.appendChild(buildDetailHero(r, { includeTitle: false }));
  var summary = mk('div', 'detail-summary');
  var summaryTitle = document.createElement('h1');
  summaryTitle.className = 'detail-summary-title';
  summaryTitle.textContent = r.title;
  summary.appendChild(summaryTitle);
  var sourceDiv = mk('div', 'source');
  sourceDiv.appendChild(document.createTextNode('Källa: '));
  if (r.sourceUrl && r.sourceUrl !== '#') {
    var a = mk('a');
    a.href = r.sourceUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = r.source;
    sourceDiv.appendChild(a);
  } else {
    sourceDiv.appendChild(document.createTextNode(r.source));
  }
  summary.appendChild(sourceDiv);
  var metaRow = mk('div', 'detail-meta-row');
  var badgesDiv = mk('div', 'badges');
  if (r.category) {
    var catBadge = mk('span', 'badge');
    catBadge.textContent = categoryLabel(r.category);
    badgesDiv.appendChild(catBadge);
  }
  if (r.tags && r.tags.length) {
    r.tags.forEach(function(tid) {
      var tb = mk('span', 'badge');
      tb.textContent = TAG_LABELS[tid] || tid;
      badgesDiv.appendChild(tb);
    });
  }
  (r.badges || []).forEach(function(b) {
    var badge = mk('span', 'badge');
    badge.textContent = b;
    badgesDiv.appendChild(badge);
  });
  metaRow.appendChild(badgesDiv);
  var servCtrl = mk('div', 'serv-ctrl');
  var minusBtn = mk('button', 'serv-btn');
  minusBtn.type = 'button';
  minusBtn.textContent = '−';
  minusBtn.addEventListener('click', function() { changeServings(-1); });
  var servValEl = mk('span', 'serv-val');
  servValEl.id = 'serv-val';
  servValEl.textContent = String(currentServings);
  var servLbl = mk('span', 'serv-lbl');
  servLbl.textContent = 'portioner';
  var plusBtn = mk('button', 'serv-btn');
  plusBtn.type = 'button';
  plusBtn.textContent = '+';
  plusBtn.addEventListener('click', function() { changeServings(1); });
  servCtrl.appendChild(minusBtn);
  servCtrl.appendChild(servValEl);
  servCtrl.appendChild(servLbl);
  servCtrl.appendChild(plusBtn);
  metaRow.appendChild(servCtrl);
  summary.appendChild(metaRow);
  var macrosDiv = mk('div', 'macros');
  [
    { id: 'm-kcal', val: r.macros.kcal, lbl: 'kcal' },
    { id: 'm-prot', val: r.macros.prot + 'g', lbl: 'protein' },
    { id: 'm-carb', val: r.macros.carb + 'g', lbl: 'kolhydrater' },
    { id: 'm-fat', val: r.macros.fat + 'g', lbl: 'fett' }
  ].forEach(function(m) {
    var mac = mk('div', 'mac');
    var valEl = mk('span', 'mac-val');
    valEl.id = m.id;
    valEl.textContent = String(m.val);
    var lblEl = mk('span', 'mac-lbl');
    lblEl.textContent = m.lbl;
    mac.appendChild(valEl);
    mac.appendChild(lblEl);
    macrosDiv.appendChild(mac);
  });
  summary.appendChild(macrosDiv);
  top.appendChild(summary);
  c.appendChild(top);
  var twoCol = mk('div', 'two-col');
  var ingCol = mk('div');
  var ingTitle = mk('div', 'sec-title');
  ingTitle.textContent = 'Ingredienser';
  ingCol.appendChild(ingTitle);
  r.groups.forEach(function(g) {
    var grp = mk('div', 'ing-grp');
    var grpName = mk('div', 'ing-grp-name');
    grpName.textContent = g.name;
    grp.appendChild(grpName);
    g.ingredients.forEach(function(ing) {
      var row = mk('div', 'ing-row');
      var nameEl = mk('span');
      nameEl.textContent = ing.name;
      row.appendChild(nameEl);
      var amtEl = mk('span', 'ing-amt');
      amtEl.dataset.base = ing.amount;
      amtEl.dataset.unit = ing.unit;
      amtEl.textContent = fmt(ing.amount, ing.unit);
      row.appendChild(amtEl);
      grp.appendChild(row);
    });
    ingCol.appendChild(grp);
  });
  twoCol.appendChild(ingCol);
  var stepsCol = mk('div');
  var stepsTitle = mk('div', 'sec-title');
  stepsTitle.textContent = 'Gör så här';
  stepsCol.appendChild(stepsTitle);
  r.steps.forEach(function(s, i) {
    var step = mk('div', 'step');
    var num = mk('div', 'step-num');
    num.textContent = String(i + 1);
    step.appendChild(num);
    var body = mk('div');
    var stitle = mk('div', 'step-title');
    stitle.textContent = s.title;
    var stext = mk('div', 'step-text');
    stext.textContent = s.text;
    body.appendChild(stitle);
    body.appendChild(stext);
    step.appendChild(body);
    stepsCol.appendChild(step);
  });
  twoCol.appendChild(stepsCol);
  c.appendChild(twoCol);
  var tipsTitle = mk('div', 'sec-title');
  tipsTitle.textContent = 'Tips & variationer';
  c.appendChild(tipsTitle);
  var tipsGrid = mk('div', 'tips-grid');
  r.tips.forEach(function(t) {
    var box = mk('div', 'tip-box');
    var ttitle = mk('div', 'tip-title');
    ttitle.textContent = t.title;
    var ttext = mk('div', 'tip-text');
    ttext.textContent = t.text;
    box.appendChild(ttitle);
    box.appendChild(ttext);
    tipsGrid.appendChild(box);
  });
  c.appendChild(tipsGrid);
  document.getElementById('view-list').classList.add('hidden');
  document.getElementById('view-detail').classList.remove('hidden');
  applyServingsScale();
  window.scrollTo(0, 0);
}

function routeFromLocation() {
  var id = getRecipeIdFromHash();
  if (id && recipes.some(function(r) { return r.id === id; })) showDetail(id, true);
}

window.addEventListener('popstate', function() {
  var id = getRecipeIdFromHash();
  if (id && recipes.some(function(r) { return r.id === id; })) showDetail(id, true);
  else showList(true);
});

window.addEventListener('hashchange', function() {
  var id = getRecipeIdFromHash();
  if (id && recipes.some(function(r) { return r.id === id; })) showDetail(id, true);
  else showList(true);
});

function bootApp(data) {
  recipes = data.recipes || [];
  FEATURED_NEW_IDS.length = 0;
  (data.featuredNewIds || []).forEach(function(id) { FEATURED_NEW_IDS.push(id); });
  RecipeValidate.reportAtLoad(recipes, TAG_FILTER_ORDER, CATEGORY_ORDER);
  renderCategoryNav();
  renderList();
  routeFromLocation();
}

fetch('/api/recipes', { credentials: 'same-origin' })
  .then(function(res) {
    if (res.status === 401) {
      location.href = '/login.html';
      return null;
    }
    if (!res.ok) throw new Error('Kunde inte hämta recept');
    return res.json();
  })
  .then(function(data) {
    if (data) bootApp(data);
  })
  .catch(function() {
    var banner = document.createElement('div');
    banner.className = 'recipe-validate-banner';
    banner.setAttribute('role', 'alert');
    banner.textContent = 'Kunde inte ladda recept. Försök ladda om sidan.';
    document.body.insertBefore(banner, document.body.firstChild);
  });
