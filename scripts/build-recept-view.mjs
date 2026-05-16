import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcPath = path.join(root, 'recept/index.html');
const src = fs.readFileSync(srcPath, 'utf8');
const m = src.match(/const RECIPES = \[([\s\S]*?)\];\n/);
if (!m) throw new Error('RECIPES not found');

let recipesBlock = m[0];
const cats = {
  'buffalo-chicken-crust-pizza': 'middag',
  'hot-honey-chicken-sliders': 'middag',
  'cinnamon-sugar-donut-holes': 'middag',
  'gochujang-gnocchi': 'middag',
  'dumpling-lasagna': 'asiatisk',
  'one-pan-dumplings-with-greens': 'asiatisk',
  'thai-basil-beef-rolls': 'asiatisk',
  'numbing-chicken-cucumber': 'sallad',
  'tuna-chili-crisp-salad': 'sallad',
  'smashed-cucumber': 'sallad',
  'smashed-pickle-salad': 'sallad',
  'edamame-spread': 'sallad',
  'hoagie-brod': 'brod'
};
for (const [id, cat] of Object.entries(cats)) {
  recipesBlock = recipesBlock.replace(
    new RegExp("\\{id:'" + id + "'"),
    "{id:'" + id + "',category:'" + cat + "'"
  );
}

const out = `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Recept</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #ffffff; --bg2: #f5f4f0; --bg3: #eeedea;
    --text: #1a1a18; --text2: #6b6b65; --text3: #9a9a94;
    --border: rgba(0,0,0,0.09); --border2: rgba(0,0,0,0.16);
    --info: #1a5fa8; --radius: 8px; --radius-lg: 12px;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #1c1c1a; --bg2: #252522; --bg3: #2e2e2a;
      --text: #f0efe8; --text2: #a0a09a; --text3: #6a6a64;
      --border: rgba(255,255,255,0.09); --border2: rgba(255,255,255,0.16);
      --info: #5ba3e8;
    }
  }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg3); color: var(--text); min-height: 100vh; }
  .app { max-width: 1100px; margin: 0 auto; padding: 1.5rem 1rem 4rem; }
  .list-header { margin-bottom: 0.75rem; }
  .list-header h1 { font-size: 20px; font-weight: 500; color: var(--text); }
  .cat-nav { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 1.25rem; }
  .cat-pill { font-size: 12px; font-family: inherit; padding: 0.35rem 0.7rem; border-radius: 999px; border: 0.5px solid var(--border2); background: var(--bg); color: var(--text2); cursor: pointer; transition: background 0.12s, color 0.12s, border-color 0.12s; }
  .cat-pill:hover { background: var(--bg2); color: var(--text); }
  .cat-pill.active { background: var(--info); color: #fff; border-color: var(--info); }
  .cat-section { margin-bottom: 1.75rem; }
  .cat-heading { font-size: 11px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text2); margin-bottom: 0.65rem; padding-bottom: 0.35rem; border-bottom: 0.5px solid var(--border); }
  .recipe-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; align-items: start; }
  .recipe-card { background: var(--bg); border: 0.5px solid var(--border); border-radius: var(--radius-lg); padding: 0.7rem 0.65rem 0.75rem; cursor: pointer; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 0.32rem; transition: background 0.12s, box-shadow 0.12s; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
  .recipe-card:hover { background: var(--bg2); box-shadow: 0 3px 10px rgba(0,0,0,0.07); }
  .recipe-emoji { font-size: 30px; line-height: 1; flex-shrink: 0; }
  .recipe-info { flex: 0 1 auto; min-width: 0; width: 100%; display: flex; flex-direction: column; align-items: center; }
  .recipe-info h2 { font-size: 13px; font-weight: 500; color: var(--text); line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; max-width: 100%; }
  .recipe-meta { font-size: 10px; color: var(--text2); margin-top: 2px; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .back-btn { display: inline-flex; align-items: center; gap: 5px; font-size: 13px; color: var(--info); cursor: pointer; margin-bottom: 1.25rem; background: none; border: none; padding: 0; font-family: inherit; }
  .hero { width: 100%; height: 100px; border-radius: var(--radius-lg); background: var(--bg2); display: flex; align-items: center; justify-content: center; font-size: 56px; line-height: 1; margin-bottom: 1.1rem; }
  .detail-titlerow { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 4px; }
  .detail-title { font-size: 20px; font-weight: 500; color: var(--text); }
  .serv-ctrl { display: flex; align-items: center; gap: 7px; flex-shrink: 0; }
  .serv-btn { width: 26px; height: 26px; border-radius: 50%; border: 0.5px solid var(--border2); background: var(--bg); color: var(--text); font-size: 15px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-family: inherit; }
  .serv-val { font-size: 13px; font-weight: 500; color: var(--text); min-width: 16px; text-align: center; }
  .source { font-size: 12px; color: var(--text2); margin-bottom: 1rem; }
  .source a { color: var(--info); text-decoration: none; }
  .badges { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 1.1rem; }
  .badge { font-size: 11px; padding: 2px 8px; border-radius: var(--radius); background: var(--bg2); color: var(--text2); border: 0.5px solid var(--border); }
  .macros { display: grid; grid-template-columns: repeat(4,1fr); gap: 7px; margin-bottom: 1.5rem; }
  .mac { background: var(--bg2); border-radius: var(--radius); padding: 0.65rem; text-align: center; }
  .mac-val { font-size: 16px; font-weight: 500; color: var(--text); display: block; }
  .mac-lbl { font-size: 10px; color: var(--text2); margin-top: 2px; display: block; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem; }
  .sec-title { font-size: 10px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text2); margin-bottom: 0.65rem; }
  .ing-grp { margin-bottom: 0.9rem; }
  .ing-grp-name { font-size: 11px; font-weight: 500; color: var(--text2); margin-bottom: 0.3rem; padding-bottom: 0.25rem; border-bottom: 0.5px solid var(--border); }
  .ing-row { display: flex; justify-content: space-between; font-size: 13px; color: var(--text); padding: 3px 0; border-bottom: 0.5px solid var(--border); }
  .ing-row:last-child { border-bottom: none; }
  .ing-amt { color: var(--text2); white-space: nowrap; margin-left: 8px; }
  .step { display: flex; gap: 9px; margin-bottom: 0.8rem; }
  .step-num { width: 19px; height: 19px; min-width: 19px; border-radius: 50%; background: var(--bg2); border: 0.5px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 500; color: var(--text2); margin-top: 1px; }
  .step-title { font-size: 12px; font-weight: 500; color: var(--text); margin-bottom: 1px; }
  .step-text { font-size: 12px; color: var(--text2); line-height: 1.5; }
  .tips-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
  .tip-box { background: var(--bg2); border-radius: var(--radius); padding: 0.65rem 0.85rem; }
  .tip-title { font-size: 11px; font-weight: 500; color: var(--text); margin-bottom: 3px; }
  .tip-text { font-size: 12px; color: var(--text2); line-height: 1.5; }
  .hidden { display: none !important; }
  @media (max-width: 900px) { .recipe-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 520px) {
    .recipe-grid { grid-template-columns: 1fr; }
    .two-col { grid-template-columns: 1fr; }
    .tips-grid { grid-template-columns: 1fr; }
    .macros { grid-template-columns: repeat(2,1fr); }
  }
</style>
</head>
<body>
<div class="app">
  <div id="view-list">
    <div class="list-header"><h1>Recept</h1></div>
    <nav class="cat-nav" id="cat-nav" aria-label="Kategorier"></nav>
    <div id="recipe-list"></div>
  </div>
  <div id="view-detail" class="hidden">
    <button type="button" class="back-btn" id="back-btn">← Alla recept</button>
    <div id="detail-content"></div>
  </div>
</div>
<script>
${recipesBlock}

const CATEGORY_ORDER = ['middag', 'asiatisk', 'sallad', 'brod'];
const CATEGORY_LABELS = {
  middag: 'Middag',
  asiatisk: 'Asiatiskt',
  sallad: 'Sallader & tillbehör',
  brod: 'Bröd & bakning'
};

var recipes = RECIPES;
var activeCategory = 'all';
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
}

function createRecipeCard(r) {
  var card = mk('div', 'recipe-card');
  card.setAttribute('role', 'button');
  card.tabIndex = 0;
  var emojiEl = mk('div', 'recipe-emoji');
  emojiEl.textContent = r.emoji;
  card.appendChild(emojiEl);
  var info = mk('div', 'recipe-info');
  var h2 = document.createElement('h2');
  h2.textContent = r.title;
  info.appendChild(h2);
  var meta = mk('div', 'recipe-meta');
  meta.textContent = r.badges.slice(0, 2).join(' · ');
  info.appendChild(meta);
  card.appendChild(info);
  function open() { showDetail(r.id); }
  card.addEventListener('click', open);
  card.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
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
  if (activeCategory === 'all') {
    CATEGORY_ORDER.forEach(function(cat) {
      var inCat = recipes.filter(function(r) { return r.category === cat; });
      if (!inCat.length) return;
      var section = mk('div', 'cat-section');
      var heading = mk('div', 'cat-heading');
      heading.textContent = categoryLabel(cat);
      section.appendChild(heading);
      var grid = mk('div', 'recipe-grid');
      inCat.forEach(function(r) { grid.appendChild(createRecipeCard(r)); });
      section.appendChild(grid);
      container.appendChild(section);
    });
  } else {
    var grid = mk('div', 'recipe-grid');
    list.forEach(function(r) { grid.appendChild(createRecipeCard(r)); });
    container.appendChild(grid);
  }
}

function showList() {
  document.getElementById('view-list').classList.remove('hidden');
  document.getElementById('view-detail').classList.add('hidden');
  window.scrollTo(0, 0);
}

document.getElementById('back-btn').addEventListener('click', showList);

function changeServings(d) {
  currentServings = Math.max(1, currentServings + d);
  var r = recipes.find(function(x) { return x.id === currentId; });
  if (!r) return;
  document.getElementById('serv-val').textContent = currentServings;
  document.getElementById('m-kcal').textContent = Math.round(r.macros.kcal * currentServings);
  document.getElementById('m-prot').textContent = Math.round(r.macros.prot * currentServings) + 'g';
  document.getElementById('m-carb').textContent = Math.round(r.macros.carb * currentServings) + 'g';
  document.getElementById('m-fat').textContent = Math.round(r.macros.fat * currentServings) + 'g';
  document.querySelectorAll('.ing-amt').forEach(function(el) {
    el.textContent = fmt(parseFloat(el.dataset.base) * currentServings, el.dataset.unit);
  });
}

function showDetail(id) {
  var r = recipes.find(function(x) { return x.id === id; });
  if (!r) return;
  currentId = id;
  currentServings = 1;
  var c = document.getElementById('detail-content');
  c.replaceChildren();
  var hero = mk('div', 'hero');
  hero.textContent = r.emoji;
  c.appendChild(hero);
  var titleRow = mk('div', 'detail-titlerow');
  var titleEl = mk('div', 'detail-title');
  titleEl.textContent = r.title;
  titleRow.appendChild(titleEl);
  var servCtrl = mk('div', 'serv-ctrl');
  var minusBtn = mk('button', 'serv-btn');
  minusBtn.type = 'button';
  minusBtn.textContent = '−';
  minusBtn.addEventListener('click', function() { changeServings(-1); });
  var servValEl = mk('span', 'serv-val');
  servValEl.id = 'serv-val';
  servValEl.textContent = '1';
  var plusBtn = mk('button', 'serv-btn');
  plusBtn.type = 'button';
  plusBtn.textContent = '+';
  plusBtn.addEventListener('click', function() { changeServings(1); });
  servCtrl.appendChild(minusBtn);
  servCtrl.appendChild(servValEl);
  servCtrl.appendChild(plusBtn);
  titleRow.appendChild(servCtrl);
  c.appendChild(titleRow);
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
  c.appendChild(sourceDiv);
  var badgesDiv = mk('div', 'badges');
  if (r.category) {
    var catBadge = mk('span', 'badge');
    catBadge.textContent = categoryLabel(r.category);
    badgesDiv.appendChild(catBadge);
  }
  r.badges.forEach(function(b) {
    var badge = mk('span', 'badge');
    badge.textContent = b;
    badgesDiv.appendChild(badge);
  });
  c.appendChild(badgesDiv);
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
  c.appendChild(macrosDiv);
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
  window.scrollTo(0, 0);
}

renderCategoryNav();
renderList();
</script>
</body>
</html>
`;

const html2 = out.split('motion').join('div');
fs.writeFileSync(path.join(root, 'recept/index.html'), html2);
console.log('Wrote recept/index.html', html2.length, 'bytes');
