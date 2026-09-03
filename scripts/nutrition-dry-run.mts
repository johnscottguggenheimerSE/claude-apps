/**
 * Steg A punkt 3 — seed + dry-run (NO production D1 writes).
 *
 * Usage:
 *   npx tsx scripts/nutrition-dry-run.mts
 *   npx tsx scripts/nutrition-dry-run.mts --from-api
 *
 * Reads scripts/nutrition-seed.json + recipes (local recipes.js or live API).
 * Prints match summary; writes scripts/nutrition-dry-run.report.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const nutritionUrl = pathToFileURL(
  path.join(root, 'worker/src/nutrition/index.ts')
).href;
const {
  catalogFromSeed,
  resolveRecipeIngredients,
  normalizeIngredientName,
} = await import(nutritionUrl);

const seedPath = path.join(root, 'scripts/nutrition-seed.json');
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
const catalog = catalogFromSeed(seed.ingredients);

async function loadRecipesFromApi() {
  const res = await fetch('https://receptbok.receptbok.workers.dev/api/recipes', {
    headers: { Accept: 'application/json', 'User-Agent': 'receptbok-nutrition-dry-run' },
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  return data.recipes || [];
}

function loadRecipesFromJs() {
  const src = fs.readFileSync(path.join(root, 'recept/recipes.js'), 'utf8');
  const sandbox = { RECIPES: null, FEATURED_NEW_IDS: null };
  vm.runInNewContext(src + '\n;this.RECIPES=RECIPES;', sandbox);
  return sandbox.RECIPES || [];
}

const useApi = process.argv.includes('--from-api');
let recipes;
let source;
try {
  if (useApi) {
    recipes = await loadRecipesFromApi();
    source = 'api';
  } else {
    try {
      recipes = await loadRecipesFromApi();
      source = 'api';
    } catch {
      recipes = loadRecipesFromJs();
      source = 'recipes.js';
    }
  }
} catch (e) {
  recipes = loadRecipesFromJs();
  source = 'recipes.js';
  console.warn('API failed, using recipes.js:', e.message || e);
}

const unmatched = new Map(); // name -> { count, recipeIds, normalized }
const needsPiece = new Map();
const matchedNames = new Map();
let totalRows = 0;
let matchedRows = 0;
let unmatchedRows = 0;
let needsPieceRows = 0;

const perRecipe = [];

for (const recipe of recipes) {
  const resolution = resolveRecipeIngredients(catalog, recipe);
  const oldMacros = recipe.macros || null;
  const rowUnmatched = [];
  const rowNeeds = [];

  for (const row of resolution.rows) {
    totalRows += 1;
    if (row.match_status === 'matched') {
      matchedRows += 1;
      const key = row.canonical_name || row.raw_text;
      matchedNames.set(key, (matchedNames.get(key) || 0) + 1);
    } else if (row.match_status === 'unmatched') {
      unmatchedRows += 1;
      const norm = normalizeIngredientName(row.raw_text);
      const key = row.raw_text;
      const prev = unmatched.get(key) || { count: 0, recipeIds: [], normalized: norm };
      prev.count += 1;
      if (!prev.recipeIds.includes(recipe.id)) prev.recipeIds.push(recipe.id);
      unmatched.set(key, prev);
      rowUnmatched.push(row.raw_text);
    } else if (row.match_status === 'needs_piece_weight') {
      needsPieceRows += 1;
      const key = row.raw_text;
      const prev = needsPiece.get(key) || {
        count: 0,
        recipeIds: [],
        normalized: normalizeIngredientName(row.raw_text),
        canonical: row.canonical_name,
      };
      prev.count += 1;
      if (!prev.recipeIds.includes(recipe.id)) prev.recipeIds.push(recipe.id);
      needsPiece.set(key, prev);
      rowNeeds.push(row.raw_text);
    }
  }

  const drift = oldMacros
    ? {
        old: oldMacros,
        next: resolution.macros,
        dKcal: resolution.macros.kcal - (oldMacros.kcal || 0),
        dProt: resolution.macros.prot - (oldMacros.prot || 0),
      }
    : null;

  perRecipe.push({
    id: recipe.id,
    title: recipe.title,
    rows: resolution.rows.length,
    matched: resolution.rows.length - resolution.unmatchedCount - resolution.needsPieceWeightCount,
    unmatched: resolution.unmatchedCount,
    needsPieceWeight: resolution.needsPieceWeightCount,
    unmatchedNames: rowUnmatched,
    needsPieceNames: rowNeeds,
    newMacros: resolution.macros,
    oldMacros,
    drift,
  });
}

function mapToList(map) {
  return [...map.entries()]
    .map(([name, meta]) => ({ name, ...meta }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'sv'));
}

const largeDrift = perRecipe
  .filter((r) => r.drift && (Math.abs(r.drift.dKcal) >= 150 || Math.abs(r.drift.dProt) >= 20))
  .map((r) => ({
    id: r.id,
    title: r.title,
    old: r.oldMacros,
    next: r.newMacros,
    dKcal: r.drift.dKcal,
    dProt: r.drift.dProt,
    unmatchedNames: r.unmatchedNames,
    needsPieceNames: r.needsPieceNames,
  }))
  .sort((a, b) => Math.abs(b.dKcal) - Math.abs(a.dKcal));

const report = {
  generatedAt: new Date().toISOString(),
  source,
  seed: {
    path: 'scripts/nutrition-seed.json',
    ingredients: seed.ingredients.length,
    aliases: seed.ingredients.reduce((n, i) => n + 1 + (i.aliases?.length || 0), 0),
  },
  summary: {
    recipes: recipes.length,
    totalRows,
    matchedRows,
    unmatchedRows,
    needsPieceWeightRows: needsPieceRows,
    matchRate: totalRows ? +(matchedRows / totalRows).toFixed(3) : 0,
  },
  unmatched: mapToList(unmatched),
  needsPieceWeight: mapToList(needsPiece),
  largeMacroDrift: largeDrift,
  perRecipe,
};

const outPath = path.join(root, 'scripts/nutrition-dry-run.report.json');
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log('=== Nutrition dry-run (NO D1 writes) ===');
console.log(`Source: ${source}`);
console.log(`Seed: ${report.seed.ingredients} ingredients / ${report.seed.aliases} alias keys`);
console.log(`Recipes: ${report.summary.recipes}`);
console.log(`Rows: ${totalRows} total | ${matchedRows} matched | ${unmatchedRows} unmatched | ${needsPieceRows} needs_piece_weight`);
console.log(`Match rate: ${(report.summary.matchRate * 100).toFixed(1)}%`);
console.log('');
console.log('--- unmatched (unique names) ---');
for (const u of report.unmatched) {
  console.log(`  ${u.count}×  ${u.name}  → norm="${u.normalized}"  [${u.recipeIds.join(', ')}]`);
}
console.log('');
console.log('--- needs_piece_weight ---');
for (const u of report.needsPieceWeight) {
  console.log(`  ${u.count}×  ${u.name}  (canonical=${u.canonical})  [${u.recipeIds.join(', ')}]`);
}
console.log('');
console.log(`--- large macro drift (|Δkcal|≥150 or |Δprot|≥20): ${largeDrift.length} ---`);
for (const d of largeDrift.slice(0, 25)) {
  console.log(
    `  ${d.id}: ${d.old?.kcal}/${d.old?.prot}P → ${d.next.kcal}/${d.next.prot}P  (Δ ${d.dKcal}/${d.dProt}P)`
  );
}
console.log('');
console.log(`Full report: ${outPath}`);
console.log('DRY-RUN ONLY — nothing written to production D1.');
