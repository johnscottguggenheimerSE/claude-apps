#!/usr/bin/env node
/**
 * Batch-normalisera alla recept (språk + mått + makros) och skriv D1-SQL.
 *
 *   npx tsx scripts/batch-normalize-recipes.mjs
 *   cd worker && npx wrangler d1 execute receptbok-db --remote --file=../scripts/batch-normalize-recipes.sql
 */
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const API = 'https://receptbok.receptbok.workers.dev/api/recipes';

const { normalizeRecipe } = await import(
  pathToFileURL(join(root, 'worker/src/validate.ts')).href
);
const { catalogFromSeed, resolveAndApplyRecipe } = await import(
  pathToFileURL(join(root, 'worker/src/nutrition/index.ts')).href
);
const seed = JSON.parse(
  (await import('fs')).readFileSync(join(root, 'scripts/nutrition-seed.json'), 'utf8')
);
const nutritionCatalog = catalogFromSeed(seed.ingredients);

function escSql(s) {
  return String(s).replace(/'/g, "''");
}

function macrosEqual(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    Number(a.kcal) === Number(b.kcal) &&
    Number(a.prot) === Number(b.prot) &&
    Number(a.carb) === Number(b.carb) &&
    Number(a.fat) === Number(b.fat)
  );
}

function summarizeDiff(before, after) {
  const renames = [];
  const beforeIngs = (before.groups || []).flatMap((g) =>
    (g.ingredients || []).map((i) => i.name)
  );
  const afterIngs = (after.groups || []).flatMap((g) =>
    (g.ingredients || []).map((i) => i.name)
  );
  const n = Math.min(beforeIngs.length, afterIngs.length);
  for (let i = 0; i < n; i++) {
    if (beforeIngs[i] !== afterIngs[i]) {
      renames.push(`${beforeIngs[i]} → ${afterIngs[i]}`);
    }
  }
  const titleChanged = before.title !== after.title ? `${before.title} → ${after.title}` : null;
  return { renames, titleChanged };
}

const res = await fetch(API);
if (!res.ok) throw new Error(`API ${res.status}`);
const { recipes } = await res.json();
if (!Array.isArray(recipes) || !recipes.length) throw new Error('Inga recept från API');

const statements = [];
const report = {
  total: recipes.length,
  updated: 0,
  macrosUpdated: 0,
  macrosFailed: [],
  titleChanges: [],
  notableRenames: [],
  unchanged: 0,
  macroDeltas: [],
};

const updatedRecipes = [];

for (const raw of recipes) {
  const before = JSON.parse(JSON.stringify(raw));
  delete before.updatedAt;
  delete before.createdAt;

  const after = normalizeRecipe(JSON.parse(JSON.stringify(before)));
  delete after.updatedAt;
  delete after.createdAt;

  const { recipe: resolved } = resolveAndApplyRecipe(nutritionCatalog, after);
  Object.assign(after, resolved);
  const estimated = after.macros;
  if (estimated && (estimated.kcal || estimated.prot || estimated.carb || estimated.fat)) {
    if (!macrosEqual(before.macros, estimated)) {
      report.macroDeltas.push(
        `${after.id}: ${JSON.stringify(before.macros)} → ${JSON.stringify(estimated)}`
      );
      report.macrosUpdated += 1;
    }
  } else {
    report.macrosFailed.push(after.id);
  }

  const beforeJson = JSON.stringify(before);
  const afterJson = JSON.stringify(after);
  const { renames, titleChanged } = summarizeDiff(before, after);

  if (titleChanged) report.titleChanges.push(`${after.id}: ${titleChanged}`);
  for (const r of renames) {
    report.notableRenames.push(`${after.id}: ${r}`);
  }

  updatedRecipes.push(after);

  if (beforeJson === afterJson) {
    report.unchanged += 1;
    continue;
  }

  report.updated += 1;
  statements.push(
    `UPDATE recipes SET data = '${escSql(afterJson)}', updated_at = datetime('now') WHERE id = '${escSql(after.id)}';`
  );
}

const outSql = join(root, 'scripts/batch-normalize-recipes.sql');
writeFileSync(outSql, statements.join('\n') + (statements.length ? '\n' : ''));

const outJson = join(root, 'scripts/batch-normalize-recipes.report.json');
writeFileSync(outJson, JSON.stringify(report, null, 2) + '\n');

const seedPath = join(root, 'recept/recipes.js');
writeFileSync(
  seedPath,
  '/* eslint-disable */\n' +
    '// Receptdata — spegel av D1; valideras med: node scripts/validate-recipes.mjs\n' +
    'var RECIPES = ' +
    JSON.stringify(updatedRecipes) +
    ';\n'
);

console.log('\n=== Batch normalize report ===');
console.log(`Total:           ${report.total}`);
console.log(`Updated (SQL):   ${report.updated}`);
console.log(`Unchanged:       ${report.unchanged}`);
console.log(`Macros updated:  ${report.macrosUpdated}`);
console.log(
  `Macros failed:   ${report.macrosFailed.length ? report.macrosFailed.join(', ') : '(none)'}`
);
if (report.titleChanges.length) {
  console.log('\nTitle changes:');
  for (const t of report.titleChanges) console.log(' ', t);
}
if (report.notableRenames.length) {
  console.log(`\nIngredient renames (${report.notableRenames.length}):`);
  for (const r of report.notableRenames.slice(0, 60)) console.log(' ', r);
}
if (report.macroDeltas.length) {
  console.log(`\nMacro deltas (${report.macroDeltas.length}):`);
  for (const d of report.macroDeltas.slice(0, 40)) console.log(' ', d);
}
console.log(`\nSQL: ${outSql} (${statements.length} statements)`);
console.log(`Report: ${outJson}`);
console.log(`Seed: ${seedPath}`);
