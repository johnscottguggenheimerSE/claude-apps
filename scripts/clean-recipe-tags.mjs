#!/usr/bin/env node
/**
 * Tar bort taggar som inte finns i browse-menyn (proteinkälla + diet).
 * Kör: node scripts/clean-recipe-tags.mjs
 * D1: cd worker && npx wrangler d1 execute receptbok-db --remote --file=../scripts/clean-recipe-tags.sql
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

/** Samma som browse-nav + diet (vegetarisk, fisk via tag). */
export const ALLOWED_TAGS = new Set([
  'kyckling', 'notkott', 'flask', 'fisk', 'skaldjur', 'vegetarisk', 'vegan',
]);

const REMOVED = new Set([
  'hog-protein', 'snabb', 'meal-prep', 'laggkolhydrat',
  'ugn', 'airfryer', 'stekpanna', 'tillbehor',
]);

/** id → rensade taggar efter manuell granskning */
const OVERRIDES = {
  'smashed-cucumber': ['vegetarisk'],
  'one-pan-dumplings-with-greens': [],
  'hoagie-brod': [],
  'cinnamon-sugar-donut-holes': ['vegetarisk'],
  'mexican-chicken-corn-salad': ['kyckling'],
  'honey-lime-teriyaki-beef-noodles': ['notkott'],
};

function cleanTags(tags, id) {
  if (OVERRIDES[id]) return OVERRIDES[id].slice();
  return (tags || []).filter((t) => ALLOWED_TAGS.has(t) && !REMOVED.has(t));
}

function esc(s) {
  return String(s).replace(/'/g, "''");
}

const recipesPath = join(root, 'recept/recipes.js');
let src = readFileSync(recipesPath, 'utf8');
const re = /\{"id":"([^"]+)"[^]*?"tags":(\[[^\]]*\])/g;
const updates = [];
let m;
while ((m = re.exec(src)) !== null) {
  const id = m[1];
  let tags;
  try {
    tags = JSON.parse(m[2]);
  } catch {
    continue;
  }
  const cleaned = cleanTags(tags, id);
  if (JSON.stringify(tags) === JSON.stringify(cleaned)) continue;
  updates.push({ id, before: tags, after: cleaned });
  const newJson = JSON.stringify(cleaned);
  src = src.replace(m[0], m[0].replace(m[2], newJson));
}

writeFileSync(recipesPath, src);

const sqlLines = updates.map(({ id, after }) =>
  `UPDATE recipes SET data = json_set(data, '$.tags', json('${esc(JSON.stringify(after))}'), updated_at = datetime('now') WHERE id = '${esc(id)}';`
);

const sqlPath = join(root, 'scripts/clean-recipe-tags.sql');
writeFileSync(sqlPath, sqlLines.join('\n') + (sqlLines.length ? '\n' : ''));

console.log(`Cleaned ${updates.length} recipes in recipes.js`);
updates.forEach(({ id, before, after }) => {
  console.log(`  ${id}: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
});
console.log(`Wrote ${sqlLines.length} UPDATEs to ${sqlPath}`);
