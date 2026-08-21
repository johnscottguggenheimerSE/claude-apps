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
  if (/^\/r(\/|$)/.test(path)) return '/';
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

function recipePath(id) {
  var base = BASE_PATH;
  if (!base || base === '/') return '/r/' + encodeURIComponent(id);
  if (base.slice(-1) === '/') base = base.slice(0, -1);
  return base + '/r/' + encodeURIComponent(id);
}

function recipeLink(id) {
  return recipePath(id);
}

function addPageUrl(editId, sub) {
  var base = BASE_PATH;
  if (!base.endsWith('/')) base += '/';
  var path = base === '/' ? '/add' : base + 'add';
  if (editId) return path + '/redigera?edit=' + encodeURIComponent(editId);
  return path + '/' + (sub || 'text');
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

function createCardEditButton(recipeId) {
  var btn = mk('button', 'recipe-card-edit');
  btn.type = 'button';
  btn.textContent = 'Redigera';
  btn.setAttribute('aria-label', 'Redigera recept');
  btn.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    try { sessionStorage.setItem('recept_edit_id', recipeId); } catch (err) {}
    location.href = addPageUrl(recipeId);
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
  writeIdCookie(VISIT_COOKIE_NAME, seen);
}

function shouldMarkRecipeVisited(id) {
  var skipKey = 'recept_skip_visit_' + id;
  if (sessionStorage.getItem(skipKey)) {
    sessionStorage.removeItem(skipKey);
    return false;
  }
  return true;
}

function shouldShowNewBadge(id) {
  if (FEATURED_NEW_IDS.indexOf(id) === -1) return false;
  return !getSeenRecipeIds()[id];
}

function sortRecipesForList(filtered) {
  return filtered.sort(function(a, b) {
    var aNew = shouldShowNewBadge(a.id) ? 1 : 0;
    var bNew = shouldShowNewBadge(b.id) ? 1 : 0;
    if (aNew !== bNew) return bNew - aNew;
    var au = a.updatedAt || a.createdAt || '';
    var bu = b.updatedAt || b.createdAt || '';
    if (au === bu) return 0;
    return au < bu ? 1 : -1;
  });
}

function getRecipeIdFromLocation() {
  var path = location.pathname.replace(/\/$/, '') || '/';
  var m = path.match(/(?:^|\/)r\/([^/]+)$/);
  if (m) {
    try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
  }
  var raw = (location.hash || '').replace(/^#/, '');
  if (!raw) return null;
  try { return decodeURIComponent(raw); } catch (e) { return raw; }
}

function setListUrl(replace) {
  syncFiltersToUrl(replace);
  document.title = 'Macro-friendly recipes';
}

function setRecipeUrl(id, replace) {
  var url = recipePath(id);
  if (replace) history.replaceState({ view: 'recipe', id: id }, '', url);
  else history.pushState({ view: 'recipe', id: id }, '', url);
}

function getFilterState() {
  return {
    activeFilter: activeFilter,
    activeMulti: activeMultiFilter,
    favorites: showFavoritesOnly,
    search: searchQuery.trim()
  };
}

function applyFilterState(state) {
  if (!state) return;
  activeFilter = state.activeFilter || { type: 'all', value: null };
  activeMultiFilter = state.activeMulti || { protein: [], cuisine: [] };
  showFavoritesOnly = !!state.favorites;
  searchQuery = state.search || '';
  var searchInput = document.getElementById('recipe-search');
  if (searchInput && searchInput.value !== searchQuery) searchInput.value = searchQuery;
}

function buildCurrentListUrl() {
  if (window.ReceptBrowseNav && ReceptBrowseNav.buildListUrl) {
    return ReceptBrowseNav.buildListUrl(BASE_PATH, getFilterState());
  }
  return BASE_PATH + location.search;
}

function syncFiltersToUrl(replace) {
  var url = buildCurrentListUrl();
  if (replace) history.replaceState(history.state || { view: 'list' }, '', url);
  else history.pushState({ view: 'list' }, '', url);
}

function applyFiltersFromUrl() {
  if (!window.ReceptBrowseNav || !ReceptBrowseNav.parseListUrl) return;
  applyFilterState(ReceptBrowseNav.parseListUrl(location.search));
  updateFavoritesToggleBtn();
}

var recipes = [];
var reviewSummaries = {};
var activeFilter = { type: 'all', value: null };
var activeMultiFilter = { protein: [], cuisine: [] };
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

/** Prep-/variantord som ignoreras vid makrouppslag (speglar worker). */
var ING_PREP_RE =
  'tärnad|tärnade|kuberad|kuberade|hackad|hackade|finhackad|finhackade|grovhackad|grovhackade|skivad|skivade|smashad|smashade|juliennad|juliennade|riven|rivna|persisk|persiska|färsk|färska';

/** Näringsvärden per 100 g — speglar worker/src/gemini.ts */
var ING_PER_100G = [
  { re: /kycklingfärs|malet kyckling|ground chicken/i, m: { kcal: 115, prot: 21, carb: 0, fat: 5 } },
  { re: /nötfärs|malet nötkött|extra mager nöt/i, m: { kcal: 150, prot: 20, carb: 0, fat: 8 } },
  { re: /fläsk|malet fläsk|pork/i, m: { kcal: 200, prot: 17, carb: 0, fat: 15 } },
  { re: /kycklingbröst|kycklingfilé/i, m: { kcal: 110, prot: 23, carb: 0, fat: 1.5 } },
  { re: /räk|shrimp|prawn/i, m: { kcal: 85, prot: 18, carb: 1, fat: 1 } },
  { re: /lax|salmon/i, m: { kcal: 190, prot: 20, carb: 0, fat: 12 } },
  { re: /tonfisk|tuna/i, m: { kcal: 130, prot: 25, carb: 0, fat: 3 } },
  { re: /keso\s*0|cottage\s*(cheese)?\s*(fat[\s-]?free|nonfat)/i, m: { kcal: 70, prot: 12, carb: 3, fat: 0.5 } },
  { re: /keso\s*1[,.]?\s*5|cottage\s*(cheese)?\s*(low|reduced)/i, m: { kcal: 72, prot: 12, carb: 3, fat: 1.5 } },
  { re: /keso|cottage/i, m: { kcal: 98, prot: 11, carb: 3, fat: 4 } },
  { re: /grekisk yoghurt|naturell yoghurt/i, m: { kcal: 70, prot: 7, carb: 4, fat: 3 } },
  { re: /äggvita/i, m: { kcal: 50, prot: 11, carb: 1, fat: 0 } },
  { re: /ägg/i, m: { kcal: 140, prot: 12, carb: 1, fat: 10 } },
  { re: /vetemjöl|mjöl(?!k)/i, m: { kcal: 350, prot: 10, carb: 73, fat: 1 } },
  { re: /havremjöl|havre/i, m: { kcal: 370, prot: 13, carb: 60, fat: 7 } },
  { re: /ris(?!vin|papp)|jasminris|råris/i, m: { kcal: 350, prot: 7, carb: 78, fat: 1 } },
  { re: /wrapper|wonton|gyoza|dumpling.?skal|degark/i, m: { kcal: 300, prot: 8, carb: 60, fat: 1.5 } },
  { re: /rispapper/i, m: { kcal: 330, prot: 0, carb: 82, fat: 0 } },
  { re: /panko|ströbröd/i, m: { kcal: 380, prot: 12, carb: 72, fat: 3 } },
  { re: /parmesan|mozzarella|cheddar|ost\b/i, m: { kcal: 350, prot: 25, carb: 2, fat: 27 } },
  /* Stekspray = olja (svensk logik — aldrig 0 kcal / US-etikett) */
  { re: /stekspray|olivoljespray|cooking\s*spray|oil\s*spray|\bpam\b|matlagningsspray/i, m: { kcal: 884, prot: 0, carb: 0, fat: 100 } },
  { re: /sesamolja/i, m: { kcal: 884, prot: 0, carb: 0, fat: 100 } },
  { re: /olja|oil|smör|butter/i, m: { kcal: 884, prot: 0, carb: 0, fat: 100 } },
  { re: /sesamfrö/i, m: { kcal: 570, prot: 18, carb: 12, fat: 50 } },
  { re: /soja|soy sauce|thaisoja|coconut aminos/i, m: { kcal: 55, prot: 8, carb: 5, fat: 0 } },
  { re: /sriracha|chilisås|chili\s*sauce|hot\s*sauce/i, m: { kcal: 95, prot: 1, carb: 20, fat: 1 } },
  { re: /ketchup/i, m: { kcal: 100, prot: 1, carb: 25, fat: 0 } },
  { re: /mirin/i, m: { kcal: 230, prot: 0, carb: 45, fat: 0 } },
  { re: /honung|lönnsirap|maple/i, m: { kcal: 320, prot: 0, carb: 80, fat: 0 } },
  { re: /socker|farinsocker/i, m: { kcal: 400, prot: 0, carb: 100, fat: 0 } },
  { re: /risvinäger|vinäger|ättika/i, m: { kcal: 20, prot: 0, carb: 1, fat: 0 } },
  { re: /gochujang|miso/i, m: { kcal: 200, prot: 5, carb: 35, fat: 3 } },
  { re: /ostronsås/i, m: { kcal: 50, prot: 1, carb: 10, fat: 0 } },
  { re: /fisksås/i, m: { kcal: 35, prot: 5, carb: 4, fat: 0 } },
  { re: /vitlök/i, m: { kcal: 130, prot: 6, carb: 28, fat: 0 } },
  { re: /ingefära/i, m: { kcal: 80, prot: 2, carb: 18, fat: 1 } },
  { re: /vårlök|salladslök|scallion|green\s*onion/i, m: { kcal: 32, prot: 2, carb: 7, fat: 0 } },
  { re: /lök|rödlök|gul lök/i, m: { kcal: 40, prot: 1, carb: 9, fat: 0 } },
  { re: /gurka|cucumber/i, m: { kcal: 15, prot: 1, carb: 3, fat: 0 } },
  { re: /avokado|avocado/i, m: { kcal: 160, prot: 2, carb: 9, fat: 15 } },
  { re: /morot/i, m: { kcal: 40, prot: 1, carb: 9, fat: 0 } },
  { re: /paprika(?!pulver)/i, m: { kcal: 30, prot: 1, carb: 6, fat: 0 } },
  { re: /banan/i, m: { kcal: 90, prot: 1, carb: 23, fat: 0 } },
  { re: /kakao/i, m: { kcal: 230, prot: 20, carb: 10, fat: 14 } },
  { re: /choklad/i, m: { kcal: 540, prot: 6, carb: 50, fat: 35 } },
  { re: /pb2|jordnöts?pulver/i, m: { kcal: 375, prot: 40, carb: 30, fat: 10 } },
  { re: /nötter|jordnöt|cashew|mandel/i, m: { kcal: 600, prot: 20, carb: 15, fat: 50 } }
];

var ING_PIECE_G = [
  { re: /wrapper|wonton|gyoza|dumpling/i, g: 7 },
  { re: /äggvita/i, g: 33 },
  { re: /ägg/i, g: 55 },
  { re: /avokado|avocado/i, g: 170 },
  { re: /gurka|cucumber/i, g: 280 },
  { re: /vårlök|salladslök|scallion/i, g: 10 },
  { re: /vitlöksklyfta|vitlök/i, g: 3 },
  { re: /banan/i, g: 120 },
  { re: /rispapper/i, g: 10 }
];

/** Ungefärlig vikt per näve. */
var ING_NAVE_G = [
  { re: /sesamfrö/i, g: 12 },
  { re: /vårlök|salladslök|scallion|green\s*onion/i, g: 20 },
  { re: /koriander|persilja|basilika|mynta|ört/i, g: 15 },
  { re: /grönkål|spenat|ruccola|blad/i, g: 30 }
];

function isCookingSprayName(name) {
  return /stekspray|olivoljespray|cooking\s*spray|oil\s*spray|\bpam\b|matlagningsspray/i.test(name);
}

function isOilLikeName(name) {
  return isCookingSprayName(name) || /olja|oil|smör|butter/i.test(name);
}

/** Strip prep/varianter så «lax, kuberad» / «hackad salladslök (… )» matchar baslivsmedel. */
function normalizeNameForMacros(name) {
  var n = String(name || '').toLowerCase().trim();
  n = n
    .replace(/\b(lätt|light|low[\s-]?cal(?:orie)?)\s*ketchup\b/gi, 'ketchup')
    .replace(/\bketchup\s+med\s+lågt\s+kaloriinnehåll\b/gi, 'ketchup')
    .replace(/\bketchup\s*\([^)]*kalor[^)]*\)/gi, 'ketchup')
    .replace(/\s*\([^)]*\)/g, ' ')
    .replace(new RegExp(',\\s*(?:' + ING_PREP_RE + ')(?:\\s+(?:och|och\\s+)?[\\wåäö-]*)*$', 'i'), '')
    .replace(new RegExp('^(?:' + ING_PREP_RE + ')\\s+', 'i'), '')
    .replace(/\bpersisk(?:a)?\s+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return n;
}

function lookupIngPer100g(name) {
  var n = normalizeNameForMacros(name);
  for (var i = 0; i < ING_PER_100G.length; i++) {
    if (ING_PER_100G[i].re.test(n) || ING_PER_100G[i].re.test(name)) return ING_PER_100G[i].m;
  }
  return null;
}

function lookupPieceG(name) {
  var n = normalizeNameForMacros(name);
  for (var i = 0; i < ING_PIECE_G.length; i++) {
    if (ING_PIECE_G[i].re.test(n) || ING_PIECE_G[i].re.test(name)) return ING_PIECE_G[i].g;
  }
  return null;
}

function lookupNaveG(name) {
  var n = normalizeNameForMacros(name);
  for (var i = 0; i < ING_NAVE_G.length; i++) {
    if (ING_NAVE_G[i].re.test(n) || ING_NAVE_G[i].re.test(name)) return ING_NAVE_G[i].g;
  }
  return null;
}

function amountToGrams(amount, unit, name) {
  var u = String(unit || '').toLowerCase();
  if (!isFinite(amount) || amount <= 0) return 0;
  if (u === 'g') return amount;
  if (u === 'msk') {
    if (isOilLikeName(name)) return amount * 14;
    return amount * 15;
  }
  if (u === 'tsk') {
    if (isOilLikeName(name)) return amount * 4.5;
    return amount * 5;
  }
  if (u === 'st') {
    if (isCookingSprayName(name)) return amount * 1.5;
    var piece = lookupPieceG(name);
    if (piece != null) return amount * piece;
    return null;
  }
  if (u === 'pinch') {
    if (isCookingSprayName(name)) return amount * 1.5;
    if (/salt|peppar|pepper|\bmsg\b/i.test(name)) return 0;
    /* Nypa av krydda/frö med kända makron ≈ 1 g */
    if (lookupIngPer100g(name)) return amount * 1;
    return 0;
  }
  if (u === 'näve') {
    if (isCookingSprayName(name)) return amount * 1.5;
    var nave = lookupNaveG(name);
    if (nave != null) return amount * nave;
    if (lookupIngPer100g(name)) return amount * 20;
    return 0;
  }
  if (u === 'strimlor') return 0;
  return null;
}

function finiteOrNull(n) {
  var v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) ? v : null;
}

/** Basportion: macros + grams för en ingrediensrad (före servings-skala). */
function estimateIngredientRow(ing) {
  var name = String(ing.name || '').trim();
  if (!name) return null;
  var amount = typeof ing.amount === 'number' ? ing.amount : Number(ing.amount);
  if (!Number.isFinite(amount)) return null;
  var gramsRaw = amountToGrams(amount, String(ing.unit || ''), name);
  var grams = finiteOrNull(gramsRaw);
  if (grams != null && grams <= 0) grams = null;
  var macros = null;
  if (ing.macros && typeof ing.macros === 'object') {
    var mkcal = finiteOrNull(ing.macros.kcal);
    var mprot = finiteOrNull(ing.macros.prot);
    var mcarb = finiteOrNull(ing.macros.carb);
    var mfat = finiteOrNull(ing.macros.fat);
    if (mkcal != null && mprot != null && mcarb != null && mfat != null) {
      macros = { kcal: mkcal, prot: mprot, carb: mcarb, fat: mfat };
    }
  } else if (grams != null) {
    var per100 = lookupIngPer100g(name);
    if (per100) {
      var f = grams / 100;
      var pk = finiteOrNull(per100.kcal * f);
      var pp = finiteOrNull(per100.prot * f);
      var pc = finiteOrNull(per100.carb * f);
      var pf = finiteOrNull(per100.fat * f);
      if (pk != null && pp != null && pc != null && pf != null) {
        macros = { kcal: pk, prot: pp, carb: pc, fat: pf };
      }
    }
  }
  if (!macros) return null;
  return {
    kcal: macros.kcal,
    prot: macros.prot,
    carb: macros.carb,
    fat: macros.fat,
    grams: grams
  };
}

function fillIngMacrosCell(cell, row, scale) {
  cell.replaceChildren();
  if (!row) return;
  var s = scale || 1;
  var kcal = finiteOrNull(row.kcal);
  var prot = finiteOrNull(row.prot);
  var carb = finiteOrNull(row.carb);
  var fat = finiteOrNull(row.fat);
  var gramsRaw = finiteOrNull(row.grams);
  var hasMacros = kcal != null && prot != null && carb != null && fat != null;
  var grams = gramsRaw != null && gramsRaw > 0 ? Math.round(gramsRaw * s) : null;
  // Inga makron → visa ingenting (hellre tomt än NaN / bara gram-gissning).
  if (!hasMacros) return;
  var kcalEl = mk('span', 'ing-mac-kcal');
  kcalEl.textContent = Math.round(kcal * s) + '🔥';
  cell.appendChild(kcalEl);
  cell.appendChild(document.createTextNode(' '));
  var pEl = mk('span', 'ing-mac-p');
  pEl.textContent = Math.round(prot * s) + 'P';
  cell.appendChild(pEl);
  cell.appendChild(document.createTextNode(' '));
  var fEl = mk('span', 'ing-mac-f');
  fEl.textContent = Math.round(fat * s) + 'F';
  cell.appendChild(fEl);
  cell.appendChild(document.createTextNode(' '));
  var cEl = mk('span', 'ing-mac-c');
  cEl.textContent = Math.round(carb * s) + 'C';
  cell.appendChild(cEl);
  if (grams != null) {
    cell.appendChild(document.createTextNode(' '));
    var gEl = mk('span', 'ing-mac-g');
    gEl.textContent = grams + 'g';
    cell.appendChild(gEl);
  }
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

function sourceKind(r) {
  var url = String(r.sourceUrl || '').toLowerCase();
  var src = String(r.source || '').toLowerCase();
  var label = String(r.source || '').trim();
  if (/^eget recept$/i.test(label)) return 'own';
  if (/claude|chatgpt|gemini|openai|copilot/i.test(src)) return 'ai';
  if (url.indexOf('instagram.com') !== -1 || /\binstagram\b/.test(src)) return 'instagram';
  if (url.indexOf('tiktok.com') !== -1 || /\btiktok\b/.test(src)) return 'tiktok';
  if (url.indexOf('cooking.nytimes.com') !== -1 || /\bnyt cooking\b/.test(src)) return 'nyt';
  if (/^https?:\/\//i.test(url)) return 'web';
  if (/^@[\w.]+/.test(label)) return 'instagram';
  return 'web';
}

function formatSourceLabel(source) {
  if (!source) return '';
  return String(source).trim()
    .replace(/\s+på Instagram\s*$/i, '')
    .replace(/\s+on Instagram\s*$/i, '')
    .replace(/\s+på TikTok\s*$/i, '')
    .replace(/\s+on TikTok\s*$/i, '');
}

function isKnownSource(source) {
  if (!source) return false;
  return !/^okänd källa$/i.test(String(source).trim());
}

function svgEl(tag, attrs) {
  var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (attrs) {
    Object.keys(attrs).forEach(function(k) { el.setAttribute(k, attrs[k]); });
  }
  return el;
}

function createLineIcon(kind) {
  var svg = svgEl('svg', {
    class: 'meta-line-icon',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true'
  });
  if (kind === 'clock') {
    svg.appendChild(svgEl('circle', { cx: '12', cy: '12', r: '10' }));
    svg.appendChild(svgEl('path', { d: 'M12 6v6l4 2' }));
    return svg;
  }
  if (kind === 'own') {
    svg.appendChild(svgEl('path', { d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' }));
    svg.appendChild(svgEl('circle', { cx: '12', cy: '7', r: '4' }));
    return svg;
  }
  if (kind === 'ai') {
    svg.appendChild(svgEl('path', {
      d: 'M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.581 6.135a.5.5 0 0 1-.963 0L9.937 15.5z'
    }));
    return svg;
  }
  if (kind === 'web') {
    svg.appendChild(svgEl('path', { d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' }));
    svg.appendChild(svgEl('path', { d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' }));
    return svg;
  }
  if (kind === 'instagram') {
    svg.appendChild(svgEl('rect', { x: '2', y: '2', width: '20', height: '20', rx: '5', ry: '5' }));
    svg.appendChild(svgEl('circle', { cx: '12', cy: '12', r: '4' }));
    svg.appendChild(svgEl('circle', { cx: '17.5', cy: '6.5', r: '1', fill: 'currentColor', stroke: 'none' }));
    return svg;
  }
  if (kind === 'tiktok') {
    svg.appendChild(svgEl('path', {
      d: 'M9 6v12a3 3 0 1 0 3-3V7h4V4h-7v2z',
      fill: 'currentColor',
      stroke: 'none'
    }));
    return svg;
  }
  svg.appendChild(svgEl('path', { d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' }));
  svg.appendChild(svgEl('path', { d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' }));
  return svg;
}

function createSourceIcon(kind) {
  if (kind === 'nyt') {
    var nyt = svgEl('svg', {
      class: 'meta-line-icon meta-line-icon--nyt',
      viewBox: '0 0 20 26',
      fill: 'none',
      'aria-hidden': 'true'
    });
    nyt.appendChild(svgEl('path', {
      d: 'M19.525 15.6349C19.1493 16.6925 18.5552 17.6592 17.7813 18.472C17.0073 19.2849 16.0709 19.9257 15.033 20.3528V15.6349L17.626 13.3089L15.033 11.0169V7.77185C16.0865 7.7499 17.0909 7.32167 17.8361 6.57663C18.5813 5.83159 19.0098 4.82739 19.032 3.77385C19.032 0.98785 16.366 0.00185009 14.867 0.00185009C14.4585 -0.00995777 14.0503 0.0347997 13.654 0.13485V0.26785C13.854 0.26785 14.147 0.23485 14.247 0.23485C15.293 0.23485 16.08 0.72785 16.08 1.67485C16.0717 1.87808 16.0223 2.07752 15.9348 2.26114C15.8473 2.44476 15.7235 2.60875 15.5709 2.74322C15.4183 2.8777 15.2401 2.97987 15.0469 3.04356C14.8537 3.10726 14.6497 3.13117 14.447 3.11385C11.855 3.11385 8.809 1.02085 5.497 1.02085C2.547 0.98785 0.52 3.20085 0.52 5.40585C0.52 7.61185 1.793 8.32485 3.139 8.81785V8.68485C2.89987 8.5325 2.70658 8.31807 2.57978 8.06446C2.45297 7.81085 2.3974 7.52757 2.419 7.24485C2.45518 6.73213 2.69275 6.25454 3.07983 5.91636C3.46691 5.57818 3.97206 5.40688 4.485 5.43985C7.27 5.43985 11.755 7.77285 14.54 7.77285H14.807V11.0449L12.215 13.3099L14.807 15.6358V20.4208C13.7372 20.7984 12.6094 20.9856 11.475 20.9739C7.15 20.9739 4.398 18.3538 4.398 13.9969C4.388 12.9658 4.532 11.9399 4.825 10.9509L6.984 9.99785V19.6339L11.375 17.7018V7.86485L4.938 10.7169C5.24212 9.83553 5.71707 9.02285 6.33566 8.32532C6.95426 7.6278 7.70435 7.05912 8.543 6.65185L8.51 6.53185C4.185 7.50485 0 10.7838 0 15.7018C0 21.3658 4.785 25.2969 10.355 25.2969C16.253 25.2969 19.598 21.3659 19.631 15.6349H19.525Z',
      fill: 'currentColor'
    }));
    return nyt;
  }
  if (kind === 'own' || kind === 'ai' || kind === 'web' || kind === 'instagram' || kind === 'tiktok') {
    return createLineIcon(kind);
  }
  return createLineIcon('web');
}

function appendTimeLine(container, r, className) {
  var time = formatRecipeTime(r);
  if (!time) return;
  var row = mk('div', className || 'recipe-card-time');
  row.appendChild(createLineIcon('clock'));
  var span = document.createElement('span');
  span.textContent = time;
  row.appendChild(span);
  container.appendChild(row);
}

function appendSourceLine(container, r, opts) {
  if (!isKnownSource(r.source)) return;
  opts = opts || {};
  var kind = sourceKind(r);
  var label = formatSourceLabel(r.source);
  var row = mk('div', opts.className || 'recipe-card-source');
  row.appendChild(createSourceIcon(kind));
  var hasUrl = r.sourceUrl && r.sourceUrl !== '#';
  if (hasUrl) {
    var a = mk('a', 'recipe-card-source-label');
    a.href = r.sourceUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = label;
    row.appendChild(a);
  } else {
    var span = mk('span', 'recipe-card-source-label');
    span.textContent = label;
    row.appendChild(span);
  }
  container.appendChild(row);
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
    if (!ReceptBrowseNav.recipeMatchesFilter(r, activeFilter)) return false;
    return ReceptBrowseNav.recipeMatchesMultiFilters(r, activeMultiFilter);
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

function renderListFilters() {
  var el = document.getElementById('list-filters');
  if (!el || !window.ReceptBrowseNav) return;
  ReceptBrowseNav.renderListFilters(el, {
    recipes: recipes,
    activeMulti: activeMultiFilter,
    onChange: function(multi) {
      activeMultiFilter = multi;
      syncFiltersToUrl(false);
      renderListFilters();
      renderList();
    }
  });
}

function renderBrowseNav() {
  var nav = document.getElementById('browse-nav');
  if (!nav || !window.ReceptBrowseNav) return;
  if (!isAllFilter() && !recipes.some(recipeMatchesFilter)) {
    activeFilter = { type: 'all', value: null };
    syncFiltersToUrl(true);
  }
  ReceptBrowseNav.render(nav, {
    recipes: recipes,
    activeFilter: activeFilter,
    getFilterUrl: function(filter) {
      return ReceptBrowseNav.urlForFilter(BASE_PATH, getFilterState(), filter);
    },
    onSelect: function(filter) {
      activeFilter = filter;
      var onDetail = !document.getElementById('view-detail').classList.contains('hidden');
      if (onDetail) showList(false);
      else {
        syncFiltersToUrl(false);
        renderBrowseNav();
        renderListFilters();
        renderList();
      }
    }
  });
  renderListFilters();
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

function capitalizeIngName(name) {
  var s = String(name || '').trim();
  if (!s) return s;
  return s.charAt(0).toLocaleUpperCase('sv-SE') + s.slice(1);
}

var SHOP_CHECK_PREFIX = 'recept_shop_check_';
var SHOP_MODE_PREFIX = 'recept_shop_mode_';
var ING_MACROS_PREF = 'recept_ing_macros';

function loadShopChecks(recipeId) {
  try {
    var raw = localStorage.getItem(SHOP_CHECK_PREFIX + recipeId);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveShopChecks(recipeId, checks) {
  try {
    localStorage.setItem(SHOP_CHECK_PREFIX + recipeId, JSON.stringify(checks));
  } catch (e) {}
}

function isShopMode(recipeId) {
  try {
    return localStorage.getItem(SHOP_MODE_PREFIX + recipeId) === '1';
  } catch (e) {
    return false;
  }
}

function setShopMode(recipeId, on) {
  try {
    if (on) localStorage.setItem(SHOP_MODE_PREFIX + recipeId, '1');
    else localStorage.removeItem(SHOP_MODE_PREFIX + recipeId);
  } catch (e) {}
}

function isIngMacrosOn() {
  try {
    return localStorage.getItem(ING_MACROS_PREF) === '1';
  } catch (e) {
    return false;
  }
}

function setIngMacrosOn(on) {
  try {
    if (on) localStorage.setItem(ING_MACROS_PREF, '1');
    else localStorage.removeItem(ING_MACROS_PREF);
  } catch (e) {}
}

function ingCheckKey(gi, ii) {
  return gi + ':' + ii;
}

function createToolbarLink(text, onClick) {
  var btn = mk('button', 'detail-shopping-btn');
  btn.type = 'button';
  btn.textContent = text;
  btn.addEventListener('click', onClick);
  return btn;
}

function renderIngredientToolbar(recipe, toolbarEl, onChange) {
  toolbarEl.replaceChildren();
  if (isIngMacrosOn()) {
    toolbarEl.appendChild(createToolbarLink('Dölj makron', function() {
      setIngMacrosOn(false);
      onChange();
    }));
  } else {
    toolbarEl.appendChild(createToolbarLink('Visa makron per ingrediens', function() {
      setIngMacrosOn(true);
      onChange();
    }));
  }
  if (isShopMode(recipe.id)) {
    toolbarEl.appendChild(createToolbarLink('Nollställ', function() {
      saveShopChecks(recipe.id, {});
      onChange();
    }));
    toolbarEl.appendChild(createToolbarLink('Dölj shoppinglista', function() {
      setShopMode(recipe.id, false);
      onChange();
    }));
    return;
  }
  toolbarEl.appendChild(createToolbarLink('Visa som shoppinglista', function() {
    setShopMode(recipe.id, true);
    onChange();
  }));
}

function renderDetailIngredients(recipe, host) {
  host.replaceChildren();
  host.appendChild(buildDetailIngredientsTable(recipe, isShopMode(recipe.id), isIngMacrosOn()));
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
  if (shouldShowNewBadge(r.id)) {
    var newLbl = mk('span', 'recipe-card-new');
    newLbl.textContent = 'Nytt!';
    media.appendChild(newLbl);
  }
  media.appendChild(createCardEditButton(r.id));
  media.appendChild(createFavoriteButton(r.id, 'fav-btn--card'));
  card.appendChild(media);

  var body = mk('div', 'recipe-card-body');
  var title = document.createElement('h2');
  title.className = 'recipe-card-title';
  title.textContent = r.title;
  body.appendChild(title);
  appendSourceLine(body, r);
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
  if (time) appendTimeLine(body, r);
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
  updateListHeading();
  renderBrowseNav();
  renderListFilters();
  updateFavoritesToggleBtn();
  renderList();
}

document.getElementById('back-btn').addEventListener('click', function() {
  showList(false);
});

function applyServingsScale() {
  var r = recipes.find(function(x) { return x.id === currentId; });
  if (!r) return;
  var scale = servingScale(r);
  document.getElementById('serv-val').textContent = String(currentServings);
  var yieldLine = document.querySelector('.detail-yield');
  if (yieldLine) yieldLine.textContent = 'Listan avser ' + currentServings + ' portioner.';
  document.getElementById('m-kcal').textContent = Math.round(r.macros.kcal * scale);
  document.getElementById('m-prot').textContent = Math.round(r.macros.prot * scale) + 'g';
  document.getElementById('m-carb').textContent = Math.round(r.macros.carb * scale) + 'g';
  document.getElementById('m-fat').textContent = Math.round(r.macros.fat * scale) + 'g';
  document.querySelectorAll('.ing-amt').forEach(function(el) {
    el.textContent = fmt(parseFloat(el.dataset.base) * scale, el.dataset.unit);
  });
  document.querySelectorAll('.ing-macros').forEach(function(el) {
    var kcal = finiteOrNull(el.dataset.baseKcal);
    var prot = finiteOrNull(el.dataset.baseProt);
    var carb = finiteOrNull(el.dataset.baseCarb);
    var fat = finiteOrNull(el.dataset.baseFat);
    var grams = finiteOrNull(el.dataset.baseGrams);
    if (kcal == null || prot == null || carb == null || fat == null) {
      el.replaceChildren();
      return;
    }
    fillIngMacrosCell(el, { kcal: kcal, prot: prot, carb: carb, fat: fat, grams: grams }, scale);
  });
}

function changeServings(d) {
  currentServings = Math.max(1, currentServings + d);
  applyServingsScale();
}

function createDetailActionIcon(pathList) {
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'detail-action-icon');
  pathList.forEach(function(d) {
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  });
  return svg;
}

function recipeCanonicalUrl(id) {
  return location.origin + recipeLink(id);
}

function createDetailFavoriteAction(recipeId) {
  var btn = mk('button', 'detail-action-btn detail-action-btn--fav');
  btn.type = 'button';
  var svg = createDetailActionIcon(['M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z']);
  btn.appendChild(svg);
  var label = mk('span', 'detail-action-label');
  label.textContent = 'Favorit';
  btn.appendChild(label);
  function sync() {
    var on = isFavorite(recipeId);
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.setAttribute('aria-label', on ? 'Ta bort från favoriter' : 'Spara som favorit');
    label.textContent = on ? 'Sparad' : 'Favorit';
    svg.style.fill = on ? 'currentColor' : 'none';
  }
  sync();
  btn.addEventListener('click', function(e) {
    e.preventDefault();
    toggleFavorite(recipeId);
    sync();
    updateFavoritesToggleBtn();
    if (showFavoritesOnly && !document.getElementById('view-detail').classList.contains('hidden')) return;
    if (showFavoritesOnly) renderList();
  });
  return btn;
}

function createDetailShareAction(recipe) {
  var btn = mk('button', 'detail-action-btn detail-action-btn--share');
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Dela recept');
  btn.appendChild(createDetailActionIcon([
    'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8',
    'M16 6l-4-4-4 4',
    'M12 2v13'
  ]));
  var label = mk('span', 'detail-action-label');
  label.textContent = 'Dela';
  btn.appendChild(label);

  function flashLabel(text) {
    var prev = label.textContent;
    label.textContent = text;
    window.setTimeout(function() { label.textContent = prev; }, 2000);
  }

  function copyShareUrl(url) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function() {
        flashLabel('Kopierad!');
      }).catch(function() {});
      return;
    }
    flashLabel('Kopiera länk');
  }

  btn.addEventListener('click', function() {
    var url = recipeCanonicalUrl(recipe.id);
    if (navigator.share) {
      navigator.share({ title: recipe.title, text: recipe.title, url: url }).catch(function(err) {
        if (err && err.name === 'AbortError') return;
        copyShareUrl(url);
      });
      return;
    }
    copyShareUrl(url);
  });
  return btn;
}

function createDetailEditAction(recipeId) {
  var link = mk('a', 'detail-action-btn detail-action-btn--edit');
  link.href = addPageUrl(recipeId);
  link.appendChild(createDetailActionIcon([
    'M12 20h9',
    'M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z'
  ]));
  var label = mk('span', 'detail-action-label');
  label.textContent = 'Redigera';
  link.appendChild(label);
  link.addEventListener('click', function() {
    try { sessionStorage.setItem('recept_edit_id', recipeId); } catch (e) {}
  });
  if (!window.ReceptAdmin || !window.ReceptAdmin.isAdmin) link.classList.add('hidden');
  return link;
}

function appendDetailMetaItem(list, label, valueEl) {
  var row = mk('div', 'detail-meta-item');
  var dt = mk('span', 'detail-meta-label');
  dt.textContent = label;
  var dd = mk('span', 'detail-meta-value');
  if (typeof valueEl === 'string') {
    dd.textContent = valueEl;
  } else {
    dd.appendChild(valueEl);
  }
  row.appendChild(dt);
  row.appendChild(dd);
  list.appendChild(row);
}

function formatTipTitle(title) {
  if (/^seattle$/i.test(String(title || '').trim())) return 'För barn';
  return title;
}

function buildDetailIngredientsTable(r, shopMode, showMacros) {
  var checks = shopMode ? loadShopChecks(r.id) : {};
  var table = mk('table', 'ing-table' + (shopMode ? ' ing-table--shop' : '') + (showMacros ? ' ing-table--macros' : ''));
  var tbody = document.createElement('tbody');
  var colCount = 2 + (shopMode ? 1 : 0);
  r.groups.forEach(function(g, gi) {
    if (g.name) {
      var headRow = mk('tr', 'ing-grp-head');
      var headCell = document.createElement('th');
      headCell.colSpan = colCount;
      headCell.textContent = g.name;
      headRow.appendChild(headCell);
      tbody.appendChild(headRow);
    }
    g.ingredients.forEach(function(ing, ii) {
      var row = mk('tr', 'ing-row' + (shopMode ? ' ing-row--shop' : ''));
      var key = ingCheckKey(gi, ii);
      if (shopMode) {
        var checkCell = mk('td', 'ing-shop-check');
        var label = mk('label', 'ing-shop-label');
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'ing-shop-cb';
        cb.checked = !!checks[key];
        cb.setAttribute('aria-label', capitalizeIngName(ing.name));
        cb.addEventListener('change', function() {
          checks[key] = cb.checked;
          saveShopChecks(r.id, checks);
          row.classList.toggle('ing-row--checked', cb.checked);
        });
        label.appendChild(cb);
        checkCell.appendChild(label);
        row.appendChild(checkCell);
        if (cb.checked) row.classList.add('ing-row--checked');
      }
      var qtyCell = mk('td', 'ing-qty');
      var amtEl = mk('span', 'ing-amt');
      amtEl.dataset.base = ing.amount;
      amtEl.dataset.unit = ing.unit;
      amtEl.textContent = fmt(ing.amount, ing.unit);
      qtyCell.appendChild(amtEl);
      var nameCell = mk('td', 'ing-name');
      var nameText = mk('span', 'ing-name-text');
      nameText.textContent = ing.name;
      nameCell.appendChild(nameText);
      if (showMacros) {
        var est = estimateIngredientRow(ing);
        if (est && finiteOrNull(est.kcal) != null) {
          var macroEl = mk('span', 'ing-macros');
          macroEl.dataset.baseKcal = String(est.kcal);
          macroEl.dataset.baseProt = String(est.prot);
          macroEl.dataset.baseCarb = String(est.carb);
          macroEl.dataset.baseFat = String(est.fat);
          if (est.grams != null) macroEl.dataset.baseGrams = String(est.grams);
          fillIngMacrosCell(macroEl, est, 1);
          if (macroEl.childNodes.length) nameCell.appendChild(macroEl);
        }
      }
      row.appendChild(qtyCell);
      row.appendChild(nameCell);
      tbody.appendChild(row);
    });
  });
  table.appendChild(tbody);
  return table;
}

function showDetail(id, skipHistory) {
  var r = recipes.find(function(x) { return x.id === id; });
  if (!r) return;
  if (shouldMarkRecipeVisited(id)) markRecipeVisited(id);
  currentId = id;
  document.title = r.title + ' — Macro-friendly recipes';
  if (!skipHistory) setRecipeUrl(id, false);
  else setRecipeUrl(id, true);
  updateAdminUi();
  currentServings = getBaseServings(r);
  var c = document.getElementById('detail-content');
  c.replaceChildren();

  var lead = mk('div', 'detail-lead');
  var copy = mk('div', 'detail-lead-copy');
  var titleEl = document.createElement('h1');
  titleEl.className = 'detail-title';
  titleEl.textContent = r.title;
  copy.appendChild(titleEl);
  appendSourceLine(copy, r, { className: 'detail-source' });
  appendTimeLine(copy, r, 'detail-time');

  var tagBits = [];
  if (r.category) tagBits.push(categoryLabel(r.category));
  if (r.tags && r.tags.length) {
    r.tags.forEach(function(tid) { tagBits.push(TAG_LABELS[tid] || tid); });
  }
  if (tagBits.length) {
    var tagsLine = mk('p', 'detail-tags-line');
    tagsLine.textContent = tagBits.join(' · ');
    copy.appendChild(tagsLine);
  }

  var metaList = mk('div', 'detail-meta-list');

  var rev = reviewSummaries[r.id];
  if (rev && rev.count > 0) {
    var ratingVal = mk('span', 'detail-rating-value');
    var stars = mk('span', 'detail-rating-stars');
    stars.textContent = formatStars(rev.average);
    ratingVal.appendChild(stars);
    ratingVal.appendChild(document.createTextNode(' (' + rev.count + ')'));
    appendDetailMetaItem(metaList, 'Betyg', ratingVal);
  }

  var servCtrl = mk('div', 'serv-ctrl serv-ctrl--detail');
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
  appendDetailMetaItem(metaList, 'Portioner', servCtrl);
  copy.appendChild(metaList);

  var actions = mk('div', 'detail-actions');
  actions.appendChild(createDetailFavoriteAction(r.id));
  actions.appendChild(createDetailShareAction(r));
  actions.appendChild(createDetailEditAction(r.id));
  copy.appendChild(actions);

  var macrosDiv = mk('div', 'detail-macros');
  [
    { id: 'm-kcal', val: r.macros.kcal, lbl: 'kcal' },
    { id: 'm-prot', val: r.macros.prot + 'g', lbl: 'protein' },
    { id: 'm-carb', val: r.macros.carb + 'g', lbl: 'kolhydrater' },
    { id: 'm-fat', val: r.macros.fat + 'g', lbl: 'fett' }
  ].forEach(function(m) {
    var mac = mk('div', 'detail-mac');
    var valEl = mk('span', 'detail-mac-val');
    valEl.id = m.id;
    valEl.textContent = String(m.val);
    var lblEl = mk('span', 'detail-mac-lbl');
    lblEl.textContent = m.lbl;
    mac.appendChild(valEl);
    mac.appendChild(lblEl);
    macrosDiv.appendChild(mac);
  });
  copy.appendChild(macrosDiv);

  var media = mk('div', 'detail-lead-media');
  media.appendChild(buildDetailHero(r, { includeTitle: false }));
  lead.appendChild(copy);
  lead.appendChild(media);
  c.appendChild(lead);

  var recipeGrid = mk('div', 'detail-recipe');
  var ingCol = mk('div', 'detail-recipe-col');
  var ingHeadRow = mk('div', 'detail-sec-head-row');
  var ingHead = mk('h2', 'detail-sec-head');
  ingHead.textContent = 'Ingredienser';
  ingHeadRow.appendChild(ingHead);
  var ingToolbar = mk('div', 'detail-ing-toolbar');
  ingHeadRow.appendChild(ingToolbar);
  ingCol.appendChild(ingHeadRow);
  var yieldLine = mk('p', 'detail-yield');
  yieldLine.textContent = 'Listan avser ' + currentServings + ' portioner.';
  ingCol.appendChild(yieldLine);
  var ingTableHost = mk('div', 'detail-ing-host');
  ingCol.appendChild(ingTableHost);
  function syncIngredientsUi() {
    renderDetailIngredients(r, ingTableHost);
    renderIngredientToolbar(r, ingToolbar, syncIngredientsUi);
    applyServingsScale();
  }
  syncIngredientsUi();
  recipeGrid.appendChild(ingCol);

  var stepsCol = mk('div', 'detail-recipe-col');
  var stepsHead = mk('h2', 'detail-sec-head');
  stepsHead.textContent = 'Gör så här';
  stepsCol.appendChild(stepsHead);
  var prep = mk('div', 'detail-prep');
  r.steps.forEach(function(s, i) {
    var step = mk('div', 'prep-step');
    var stepLabel = mk('div', 'prep-step-label');
    stepLabel.textContent = 'Steg ' + (i + 1);
    step.appendChild(stepLabel);
    if (s.title && s.title !== 'Steg') {
      var stitle = mk('div', 'prep-step-title');
      stitle.textContent = s.title;
      step.appendChild(stitle);
    }
    var stext = mk('p', 'prep-step-text');
    stext.textContent = s.text;
    step.appendChild(stext);
    prep.appendChild(step);
  });
  stepsCol.appendChild(prep);
  recipeGrid.appendChild(stepsCol);
  c.appendChild(recipeGrid);

  var tipsHead = mk('h2', 'detail-sec-head detail-sec-head--sub');
  tipsHead.textContent = 'Tips & variationer';
  c.appendChild(tipsHead);
  var tipsGrid = mk('div', 'tips-grid');
  r.tips.forEach(function(t) {
    var box = mk('div', 'tip-box');
    var ttitle = mk('div', 'tip-title');
    ttitle.textContent = formatTipTitle(t.title);
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
  var id = getRecipeIdFromLocation();
  if (id && recipes.some(function(r) { return r.id === id; })) showDetail(id, true);
}

window.addEventListener('popstate', function() {
  applyFiltersFromUrl();
  var id = getRecipeIdFromLocation();
  if (id && recipes.some(function(r) { return r.id === id; })) showDetail(id, true);
  else showList(true);
});

window.addEventListener('hashchange', function() {
  var id = getRecipeIdFromLocation();
  if (id && recipes.some(function(r) { return r.id === id; })) showDetail(id, true);
  else if (!location.hash) showList(true);
});

function updateAdminUi() {
  var isAdmin = !!(window.ReceptAdmin && window.ReceptAdmin.isAdmin);
  document.querySelectorAll('.detail-action-btn--edit').forEach(function(el) {
    el.classList.toggle('hidden', !isAdmin);
  });
}

window.addEventListener('recept-auth', function() {
  updateAdminUi();
  if (document.getElementById('view-list') && !document.getElementById('view-list').classList.contains('hidden')) {
    renderList();
  }
});

updateAdminUi();

function bootApp(data) {
  recipes = data.recipes || [];
  reviewSummaries = data.reviewSummaries || {};
  FEATURED_NEW_IDS.length = 0;
  (data.featuredNewIds || []).forEach(function(id) { FEATURED_NEW_IDS.push(id); });
  RecipeValidate.reportAtLoad(recipes, TAG_FILTER_ORDER, CATEGORY_ORDER);
  applyFiltersFromUrl();
  try {
    if (sessionStorage.getItem('recept_show_favorites') === '1') {
      showFavoritesOnly = true;
      sessionStorage.removeItem('recept_show_favorites');
      syncFiltersToUrl(true);
    }
    if (sessionStorage.getItem('recept_search')) {
      searchQuery = sessionStorage.getItem('recept_search');
      sessionStorage.removeItem('recept_search');
      var searchInput = document.getElementById('recipe-search');
      if (searchInput) searchInput.value = searchQuery;
      syncFiltersToUrl(true);
    }
    var storedFilter = ReceptBrowseNav.readStoredFilter();
    if (storedFilter && storedFilter.type && isAllFilter() && !location.search) {
      activeFilter = storedFilter;
      syncFiltersToUrl(true);
    }
  } catch (e) {}
  renderBrowseNav();
  updateFavoritesToggleBtn();
  renderList();
  routeFromLocation();
}

fetch('/api/recipes', { credentials: 'same-origin' })
  .then(function(res) {
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
    syncFiltersToUrl(true);
    renderList();
  });
}

var favoritesToggleBtn = document.getElementById('favorites-toggle-btn');
if (favoritesToggleBtn) {
  favoritesToggleBtn.addEventListener('click', function() {
    showFavoritesOnly = !showFavoritesOnly;
    updateFavoritesToggleBtn();
    if (showFavoritesOnly && !document.getElementById('view-detail').classList.contains('hidden')) {
      showList(false);
      return;
    }
    syncFiltersToUrl(false);
    renderList();
  });
  updateFavoritesToggleBtn();
}
