#!/usr/bin/env node
/**
 * Genererar SQL för att seeda D1 från recept/recipes.js
 * Kör: node scripts/seed-d1.mjs
 * Applicera: cd worker && npx wrangler d1 execute receptbok-db --remote --file=../scripts/seed.sql
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const recipesSrc = readFileSync(join(root, 'recept/recipes.js'), 'utf8');
const fn = new Function(recipesSrc + '\nreturn RECIPES;');
const recipes = fn();

const FEATURED = new Set(['chicken-kebab-wraps', 'rice-paper-shrimp-pancake']);

function esc(s) {
  return String(s).replace(/'/g, "''");
}

const now = new Date().toISOString();
const lines = ['DELETE FROM recipes;'];

recipes.forEach((r, i) => {
  const copy = { ...r };
  delete copy.emoji;
  const data = esc(JSON.stringify(copy));
  const featured = FEATURED.has(r.id) ? 1 : 0;
  lines.push(
    `INSERT INTO recipes (id, data, featured_new, sort_order, created_at, updated_at) VALUES ('${esc(r.id)}', '${data}', ${featured}, ${i}, '${now}', '${now}');`
  );
});

const out = join(root, 'scripts/seed.sql');
writeFileSync(out, lines.join('\n') + '\n');
console.log(`Wrote ${recipes.length} recipes to ${out}`);
