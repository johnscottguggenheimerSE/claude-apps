#!/usr/bin/env node
/**
 * Uppdaterar recepttitel till svenska i recept/recipes.js och genererar D1-SQL.
 * Kör: node scripts/update-recipe-titles.mjs
 * Applicera D1: cd worker && npx wrangler d1 execute receptbok-db --remote --file=../scripts/translate-titles.sql
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

/** id → svensk title */
export const SWEDISH_TITLES = {
  'buffalo-chicken-crust-pizza': 'Buffalo-pizza med kycklingbotten',
  'dumpling-lasagna': 'Dumplinglasagne',
  'edamame-spread': 'Krämig edamame-spread med jalapeño och basilika',
  'smashed-cucumber': 'Smashad gurka med ume och chili crunch',
  'gochujang-gnocchi': 'Krämig gochujang-gnocchi med sesambiff',
  'hot-honey-chicken-sliders': 'Kycklingslider med het honung',
  'cinnamon-sugar-donut-holes': 'Kanel-socker munkbullar',
  'numbing-chicken-cucumber': 'Sichuansallad med kyckling och gurka',
  'tuna-chili-crisp-salad': 'Tonfisksallad med chili crunch',
  'smashed-pickle-salad': 'Smashad picklesallad',
  'one-pan-dumplings-with-greens': 'Dumplings med grönsaker i en panna',
  'thai-basil-beef-rolls': 'Thailändska basilikarullar med nötkött',
  'hoagie-brod': 'Runda proteinbullar',
  'rice-paper-shrimp-pancake': 'Räkpannkaka i rispapper',
  'chicken-kebab-wraps': 'Högprotein kycklingkebab-wraps',
  'mexican-chicken-corn-salad': 'Mexikansk kyckling- och majssallad',
  'honey-lime-teriyaki-beef-noodles': 'Nudlar med honung, lime och teriyakinötkött',
};

function esc(s) {
  return String(s).replace(/'/g, "''");
}

const recipesPath = join(root, 'recept/recipes.js');
let src = readFileSync(recipesPath, 'utf8');
let updated = 0;

for (const [id, title] of Object.entries(SWEDISH_TITLES)) {
  const re = new RegExp('(\\{"id":"' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^}]*?"title":")([^"]*)(")');
  if (re.test(src)) {
    src = src.replace(re, '$1' + title + '$3');
    updated++;
  }
}

writeFileSync(recipesPath, src);

const now = new Date().toISOString();
const sqlLines = Object.entries(SWEDISH_TITLES).map(
  ([id, title]) =>
    `UPDATE recipes SET data = json_set(data, '$.title', '${esc(title)}'), updated_at = '${now}' WHERE id = '${esc(id)}';`
);

const sqlPath = join(root, 'scripts/translate-titles.sql');
writeFileSync(sqlPath, sqlLines.join('\n') + '\n');

console.log(`Updated ${updated} titles in recipes.js`);
console.log(`Wrote ${sqlLines.length} UPDATE statements to ${sqlPath}`);
