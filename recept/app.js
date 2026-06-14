const CATEGORY_ORDER = ['frukost', 'lunch', 'middag', 'tillbehor', 'fika'];
const CATEGORY_LABELS = {
  frukost: 'Frukost',
  lunch: 'Lunch',
  middag: 'Middag',
  tillbehor: 'Tillbehör',
  fika: 'Fika & bakning'
};

var TAG_FILTER_ORDER = [
  'kyckling', 'notkott', 'flask', 'fisk', 'skaldjur', 'vegetarisk', 'vegan'
];
var TAG_LABELS = {
  kyckling: 'Kyckling',
  notkott: 'Nötkött',
  flask: 'Fläsk',
  fisk: 'Fisk',
  skaldjur: 'Skaldjur',
  vegetarisk: 'Vegetariskt',
  vegan: 'Veganskt'
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
var FAVORITES_COOKIE_NAME = 'recept_favorites';
var VISIT_COOKIE_MAX_AGE = String(365 * 24 * 60 * 60);

function readIdCookie(name) {
  try {
    var parts = document.cookie.split(';');
    for (var i = 0; i < parts.length; i++) {
      var s = parts[i].trim();
      if (s.indexOf(name + '=') === 0) {
        return JSON.parse(decodeURIComponent(s.slice(name.length + 1)));
      }
    }
  } catch (e) {}
  return {};
}

function writeIdCookie(name, data) {
  document.cookie = name + '=' + encodeURIComponent(JSON.stringify(data)) + ';path=' + RECEPT_COOKIE_PATH + ';max-age=' + VISIT_COOKIE_MAX_AGE + ';SameSite=Lax';
}

function getSeenRecipeIds() {
  return readIdCookie(VISIT_COOKIE_NAME);
}

function getFavoriteIds() {
  return readIdCookie(FAVORITES_COOKIE_NAME);
}

function isFavorite(id) {
  return !!getFavoriteIds()[id];
}

function toggleFavorite(id) {
  var favs = getFavoriteIds();
  if (favs[id]) delete favs[id];
  else favs[id] = 1;
  writeIdCookie(FAVORITES_COOKIE_NAME, favs);
}

function syncFavoriteButton(btn, recipeId) {
  var on = isFavorite(recipeId);
  btn.classList.toggle('active', on);
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.setAttribute('aria-label', on ? 'Ta bort från favoriter' : 'Spara som favorit');
}

function createFavoriteButton(recipeId, extraClass) {
  var btn = mk('button', 'fav-btn' + (extraClass ? ' ' + extraClass : ''));
  btn.type = 'button';
  syncFavoriteButton(btn, recipeId);
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'fav-btn-icon');
  var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z');
  svg.appendChild(path);
  btn.appendChild(svg);
  btn.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    toggleFavorite(recipeId);
    syncFavoriteButton(btn, recipeId);
    updateFavoritesToggleBtn();
    if (showFavoritesOnly && !document.getElementById('view-detail').classList.contains('hidden')) return;
    if (showFavoritesOnly) renderList();
  });
  return btn;
}

function updateFavoritesToggleBtn() {
  var btn = document.getElementById('favorites-toggle-btn');
  if (!btn) return;
  btn.classList.toggle('active', showFavoritesOnly);
  btn.setAttribute('aria-pressed', showFavoritesOnly ? 'true' : 'false');
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
  return filtered.sort(function(a, b) {
    var au = a.updatedAt || a.createdAt || '';
    var bu = b.updatedAt || b.createdAt || '';
    if (au === bu) return 0;
    return au < bu ? 1 : -1;
  });
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
  document.title = 'Macro-friendly recipes';
}

function setRecipeUrl(id, replace) {
  var url = recipeLink(id) + location.search;
  if (replace) history.replaceState({ view: 'recipe', id: id }, '', url);
  else history.pushState({ view: 'recipe', id: id }, '', url);
}

var recipes = [];
var reviewSummaries = {};
var activeFilter = { type: 'all', value: null };
var searchQuery = '';
var showFavoritesOnly = false;
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

function formatStars(avg) {
  var full = Math.round(avg);
  var s = '';
  for (var i = 1; i <= 5; i++) s += i <= full ? '★' : '☆';
  return s;
}

function recipeMatchesSearch(r, q) {
  if (!q) return true;
  q = q.toLowerCase().trim();
  if (r.title && r.title.toLowerCase().indexOf(q) !== -1) return true;
  if (r.tags) {
    for (var i = 0; i < r.tags.length; i++) {
      var tagLabel = (TAG_LABELS[r.tags[i]] || r.tags[i]).toLowerCase();
      if (tagLabel.indexOf(q) !== -1) return true;
    }
  }
  if (r.groups) {
    for (var g = 0; g < r.groups.length; g++) {
      var ings = r.groups[g].ingredients || [];
      for (var j = 0; j < ings.length; j++) {
        if (ings[j].name && ings[j].name.toLowerCase().indexOf(q) !== -1) return true;
      }
    }
  }
  return false;
}

function listHeadingText() {
  var label = window.ReceptBrowseNav
    ? ReceptBrowseNav.filterLabel(activeFilter)
    : 'Alla recept';
  if (showFavoritesOnly) {
    if (searchQuery.trim()) return 'Favoriter — sökresultat';
    if (!isAllFilter()) return 'Favoriter — ' + label;
    return 'Favoriter';
  }
  if (searchQuery.trim()) return 'Sökresultat';
  return label;
}

function isAllFilter() {
  return !activeFilter || activeFilter.type === 'all';
}

function recipeMatchesFilter(r) {
  if (window.ReceptBrowseNav) {
    return ReceptBrowseNav.recipeMatchesFilter(r, activeFilter);
  }
  if (isAllFilter()) return true;
  if (activeFilter.type === 'category') return r.category === activeFilter.value;
  if (activeFilter.type === 'tag') {
    return r.tags && r.tags.indexOf(activeFilter.value) !== -1;
  }
  return true;
}

function updateListHeading() {
  var el = document.getElementById('list-heading');
  if (el) el.textContent = listHeadingText();
}

function renderBrowseNav() {
  var nav = document.getElementById('browse-nav');
  if (!nav || !window.ReceptBrowseNav) return;
  if (!isAllFilter() && !recipes.some(recipeMatchesFilter)) {
    activeFilter = { type: 'all', value: null };
  }
  ReceptBrowseNav.render(nav, {
    recipes: recipes,
    activeFilter: activeFilter,
    onSelect: function(filter) {
      activeFilter = filter;
      renderBrowseNav();
      renderList();
    }
  });
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

function formatRecipeTimeMinutes(raw) {
  if (!raw) return '';
  var m = String(raw).match(/(\d+)(?:[–-](\d+))?\s*min/i);
  if (!m) return '';
  var mins = m[2] ? parseInt(m[2], 10) : parseInt(m[1], 10);
  return mins + ' min';
}

function formatRecipeTime(r) {
  return formatRecipeTimeMinutes(badgeTime(r));
}

function formatBadgeLabel(b) {
  if (/kcal|protein/i.test(b)) return b;
  var time = formatRecipeTimeMinutes(b);
  if (time) return time;
  return b;
}

function cardMetricTags(r) {
  var tags = [];
  if (r.macros) {
    var n = getBaseServings(r);
    tags.push(Math.round(r.macros.kcal / n) + ' kcal/port');
    tags.push(Math.round(r.macros.prot / n) + 'g protein/port');
  }
  var time = formatRecipeTime(r);
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

  var media = mk('div', 'recipe-card-media');
  if (r.image) {
    var img = document.createElement('img');
    img.className = 'recipe-card-img';
    img.src = assetUrl(r.image);
    img.alt = '';
    img.loading = 'lazy';
    media.appendChild(img);
  } else if (r.emoji) {
    var emojiEl = mk('span', 'recipe-card-emoji');
    emojiEl.textContent = r.emoji;
    media.appendChild(emojiEl);
  }
  media.appendChild(createFavoriteButton(r.id, 'fav-btn--card'));
  card.appendChild(media);

  var body = mk('div', 'recipe-card-body');
  if (shouldShowNewBadge(r.id)) {
    var newLbl = mk('span', 'recipe-card-new');
    newLbl.textContent = 'Nytt!';
    body.appendChild(newLbl);
  }
  var title = document.createElement('h2');
  title.className = 'recipe-card-title';
  title.textContent = r.title;
  body.appendChild(title);
  if (r.source) {
    var src = mk('div', 'recipe-card-source');
    src.textContent = r.source;
    body.appendChild(src);
  }
  var rev = reviewSummaries[r.id];
  if (rev && rev.count > 0) {
    var ratingRow = mk('div', 'recipe-card-rating-row');
    var stars = mk('span', 'recipe-card-stars');
    stars.textContent = formatStars(rev.average);
    ratingRow.appendChild(stars);
    var count = mk('span', 'recipe-card-rating-count');
    count.textContent = String(rev.count);
    ratingRow.appendChild(count);
    body.appendChild(ratingRow);
  }
  var time = formatRecipeTime(r);
  if (time) {
    var timeEl = mk('div', 'recipe-card-time');
    timeEl.textContent = time;
    body.appendChild(timeEl);
  }
  if (r.tags && r.tags.length) {
    var tagsWrap = mk('div', 'recipe-card-tags');
    r.tags.slice(0, 4).forEach(function(tagId) {
      var label = TAG_LABELS[tagId] || tagId;
      var tag = mk('span', 'recipe-card-tag');
      tag.textContent = label;
      tagsWrap.appendChild(tag);
    });
    body.appendChild(tagsWrap);
  }
  card.appendChild(body);

  card.addEventListener('click', function(e) {
    if (e.target.closest('.fav-btn')) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    showDetail(r.id);
  });
  return card;
}

function renderList() {
  var container = document.getElementById('recipe-list');
  container.replaceChildren();
  updateListHeading();
  var list = recipes.filter(recipeMatchesFilter);
  list = list.filter(function(r) { return recipeMatchesSearch(r, searchQuery); });
  if (showFavoritesOnly) list = list.filter(function(r) { return isFavorite(r.id); });
  list = sortRecipesForList(list);
  if (!list.length) {
    var empty = mk('p', 'list-empty');
    empty.textContent = showFavoritesOnly
      ? 'Inga favoriter ännu — tryck på bokmärket på ett recept.'
      : 'Inga recept matchar filtret.';
    container.appendChild(empty);
    return;
  }
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
  document.title = r.title + ' — Macro-friendly recipes';
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
  var summaryHead = mk('div', 'detail-summary-head');
  var summaryTitle = document.createElement('h1');
  summaryTitle.className = 'detail-summary-title';
  summaryTitle.textContent = r.title;
  summaryHead.appendChild(summaryTitle);
  summaryHead.appendChild(createFavoriteButton(r.id, 'fav-btn--detail'));
  summary.appendChild(summaryHead);
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
    badge.textContent = formatBadgeLabel(b);
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

  var reviewsHost = mk('div', 'reviews-panel');
  reviewsHost.id = 'reviews-host';
  c.appendChild(reviewsHost);
  loadReviewsPanel(id, reviewsHost);

  document.getElementById('view-list').classList.add('hidden');
  document.getElementById('view-detail').classList.remove('hidden');
  applyServingsScale();
  window.scrollTo(0, 0);
}

function loadReviewsPanel(recipeId, host) {
  host.textContent = 'Hämtar betyg…';
  fetch('/api/recipes/' + encodeURIComponent(recipeId) + '/reviews', { credentials: 'same-origin' })
    .then(function(res) {
      return res.json().then(function(data) {
        if (!res.ok) throw new Error(data.error || 'Kunde inte hämta betyg');
        return data;
      });
    })
    .then(function(data) {
      if (data.summary) {
        reviewSummaries[recipeId] = data.summary;
      }
      renderReviewsPanel(recipeId, host, data);
    })
    .catch(function(ex) {
      host.textContent = ex.message;
    });
}

function renderReviewsPanel(recipeId, host, data) {
  host.replaceChildren();
  var title = mk('div', 'sec-title');
  title.textContent = 'Betyg & recensioner';
  host.appendChild(title);

  var summaryEl = mk('div', 'reviews-summary');
  if (data.summary && data.summary.count > 0) {
    summaryEl.textContent =
      formatStars(data.summary.average) + ' ' + data.summary.average.toFixed(1) +
      ' · ' + data.summary.count + ' betyg';
  } else {
    summaryEl.textContent = 'Inga betyg än — ge det första!';
  }
  host.appendChild(summaryEl);

  var selected = data.mine ? data.mine.rating : 0;
  var starsRow = mk('div', 'star-picker');
  var starBtns = [];
  for (var s = 1; s <= 5; s++) {
    var starBtn = mk('button', 'star-btn');
    starBtn.type = 'button';
    starBtn.textContent = s <= selected ? '★' : '☆';
    if (s <= selected) starBtn.classList.add('active');
    starBtn.setAttribute('data-star', String(s));
    starBtn.addEventListener('click', (function(val) {
      return function() {
        starBtns.forEach(function(b) {
          var n = parseInt(b.getAttribute('data-star'), 10);
          b.textContent = n <= val ? '★' : '☆';
          b.classList.toggle('active', n <= val);
        });
      };
    })(s));
    starBtns.push(starBtn);
    starsRow.appendChild(starBtn);
  }
  host.appendChild(starsRow);

  var comment = document.createElement('textarea');
  comment.className = 'review-comment';
  comment.placeholder = 'Valfri kommentar (syns för familjen)…';
  comment.value = data.mine && data.mine.comment ? data.mine.comment : '';
  host.appendChild(comment);

  var submitBtn = mk('button', 'review-submit');
  submitBtn.type = 'button';
  submitBtn.textContent = 'Spara betyg';
  submitBtn.addEventListener('click', function() {
    var rating = 0;
    starBtns.forEach(function(b) {
      if (b.classList.contains('active')) {
        var n = parseInt(b.getAttribute('data-star'), 10);
        if (n > rating) rating = n;
      }
    });
    if (!rating) {
      submitBtn.textContent = 'Välj stjärnor först';
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sparar…';
    fetch('/api/recipes/' + encodeURIComponent(recipeId) + '/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ rating: rating, comment: comment.value.trim() })
    }).then(function(res) {
      return res.json().then(function(d) {
        if (!res.ok) throw new Error(d.error || 'Sparning misslyckades');
        return d;
      });
    }).then(function(d) {
      if (d.summary) reviewSummaries[recipeId] = d.summary;
      renderReviewsPanel(recipeId, host, d);
    }).catch(function(ex) {
      submitBtn.disabled = false;
      submitBtn.textContent = ex.message;
    });
  });
  host.appendChild(submitBtn);

  if (data.recent && data.recent.length) {
    var listTitle = mk('div', 'sec-title');
    listTitle.textContent = 'Senaste kommentarer';
    listTitle.style.marginTop = '1rem';
    host.appendChild(listTitle);
    var list = mk('div', 'review-list');
    data.recent.forEach(function(item) {
      var row = mk('div', 'review-item');
      var stars = mk('div', 'review-item-stars');
      stars.textContent = formatStars(item.rating);
      row.appendChild(stars);
      if (item.comment) {
        var txt = mk('div', 'review-item-text');
        txt.textContent = item.comment;
        row.appendChild(txt);
      }
      list.appendChild(row);
    });
    host.appendChild(list);
  }
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
  reviewSummaries = data.reviewSummaries || {};
  FEATURED_NEW_IDS.length = 0;
  (data.featuredNewIds || []).forEach(function(id) { FEATURED_NEW_IDS.push(id); });
  RecipeValidate.reportAtLoad(recipes, TAG_FILTER_ORDER, CATEGORY_ORDER);
  try {
    var storedSearch = sessionStorage.getItem('recept_search');
    if (storedSearch) {
      searchQuery = storedSearch;
      var searchInput = document.getElementById('recipe-search');
      if (searchInput) searchInput.value = storedSearch;
      sessionStorage.removeItem('recept_search');
    }
    if (sessionStorage.getItem('recept_show_favorites') === '1') {
      showFavoritesOnly = true;
      sessionStorage.removeItem('recept_show_favorites');
    }
    var storedFilter = ReceptBrowseNav.readStoredFilter();
    if (storedFilter && storedFilter.type) activeFilter = storedFilter;
  } catch (e) {}
  renderBrowseNav();
  updateFavoritesToggleBtn();
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

var brandHome = document.getElementById('brand-home');
if (brandHome) {
  brandHome.addEventListener('click', function(e) {
    if (document.getElementById('view-detail').classList.contains('hidden')) return;
    e.preventDefault();
    showList();
  });
}

var recipeSearch = document.getElementById('recipe-search');
if (recipeSearch) {
  recipeSearch.addEventListener('input', function() {
    searchQuery = recipeSearch.value;
    renderList();
  });
}

var favoritesToggleBtn = document.getElementById('favorites-toggle-btn');
if (favoritesToggleBtn) {
  favoritesToggleBtn.addEventListener('click', function() {
    showFavoritesOnly = !showFavoritesOnly;
    updateFavoritesToggleBtn();
    if (showFavoritesOnly && !document.getElementById('view-detail').classList.contains('hidden')) {
      showList(true);
      return;
    }
    renderList();
  });
  updateFavoritesToggleBtn();
}
