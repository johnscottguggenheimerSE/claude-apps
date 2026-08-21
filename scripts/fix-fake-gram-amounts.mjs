#!/usr/bin/env node
/**
 * Rättar cup/tbsp→g-buggar i D1 (samma logik som worker normalizeIngredientMeasures).
 * Kör: node scripts/fix-fake-gram-amounts.mjs
 * Applicera: cd worker && npx wrangler d1 execute receptbok-db --remote --file=../scripts/fix-fake-gram-amounts.sql
 */
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function cupsToGrams(cups, name) {
  if (/smör|butter/i.test(name)) return Math.round(cups * 227);
  if (/\bmjöl\b|flour|stärkelse|starch|socker|sugar|pulver|powder|kakao|cocoa/i.test(name)) {
    return Math.round(cups * 120);
  }
  if (/havre|oats/i.test(name)) return Math.round(cups * 90);
  if (/\bris\b|rice/i.test(name)) return Math.round(cups * 185);
  return Math.round(cups * 240);
}

function normalizeIngredientMeasures(r) {
  for (const g of r.groups || []) {
    for (const ing of g.ingredients || []) {
      let amount = typeof ing.amount === 'number' ? ing.amount : Number(ing.amount);
      if (!Number.isFinite(amount)) continue;
      const name = String(ing.name || '');
      let unit = String(ing.unit || '')
        .toLowerCase()
        .trim()
        .replace(/\.$/, '');

      if (['tbsp', 'tablespoon', 'tablespoons', 'matsked', 'matskedar'].includes(unit)) {
        ing.unit = 'msk';
        ing.amount = amount;
        continue;
      }
      if (['tsp', 'teaspoon', 'teaspoons', 'tesked', 'teskedar'].includes(unit)) {
        ing.unit = 'tsk';
        ing.amount = amount;
        continue;
      }
      if (['cup', 'cups', 'kopp', 'koppar'].includes(unit)) {
        ing.amount = cupsToGrams(amount, name);
        ing.unit = 'g';
        continue;
      }
      if (unit === 'ml' || unit === 'milliliter' || unit === 'milliliters') {
        ing.amount = Math.round(amount);
        ing.unit = 'g';
        continue;
      }
      if (unit === 'dl') {
        ing.amount = Math.round(amount * 100);
        ing.unit = 'g';
        continue;
      }
      if (['oz', 'ounce', 'ounces'].includes(unit)) {
        ing.amount = Math.round(amount * 28.35);
        ing.unit = 'g';
        continue;
      }
      if (['lb', 'lbs', 'pound', 'pounds'].includes(unit)) {
        ing.amount = Math.round(amount * 453.6);
        ing.unit = 'g';
        continue;
      }
      if (['scoop', 'scoops'].includes(unit)) {
        ing.amount = Math.round(amount * 30);
        ing.unit = 'g';
        continue;
      }
      if (['shot', 'shots'].includes(unit) && /espresso|kaffe|coffee/i.test(name)) {
        ing.amount = Math.round(amount * 30);
        ing.unit = 'g';
        continue;
      }

      if (unit !== 'g' || amount <= 0 || amount > 16) continue;

      if (
        /mjölk|milk|grädde|cream|yoghurt|yogurt|vatten|water|buljong|stock|juice/i.test(name) &&
        amount <= 4 &&
        (amount !== Math.floor(amount) || amount <= 3)
      ) {
        ing.amount = cupsToGrams(amount, name);
        ing.unit = 'g';
        continue;
      }
      if (amount === 1 && /proteinpulver|protein powder|whey|kasein|casein/i.test(name)) {
        ing.amount = 30;
        continue;
      }
      if (amount >= 1 && amount <= 3 && Number.isInteger(amount) && /espresso/i.test(name)) {
        ing.amount = amount * 30;
        continue;
      }
      if (amount >= 2 && amount <= 6 && /keso|cottage/i.test(name)) {
        ing.unit = 'msk';
        continue;
      }
      if (
        amount >= 1 &&
        amount <= 4 &&
        /vaniljpasta|vaniljextrakt|vanilla (paste|extract)|lönnsirap|maple|honung|honey/i.test(name)
      ) {
        ing.unit = 'tsk';
        continue;
      }
      if (
        Number.isInteger(amount) &&
        amount >= 1 &&
        amount <= 8 &&
        /ketchup|gochujang|vinäger|vinegar|sojasås|soy|mirin|sesamolja|sesame oil|olja\b|oil\b|mayo|chili.?crisp|sambal|miso|tahini|honung|honey|sirap|syrup/i.test(
          name
        ) &&
        !/salt|peppar|jäst|bakpulver|bikarbonat|kanel|vitlökspulver|krydda/i.test(name)
      ) {
        ing.unit = 'msk';
      }
    }
  }
}

/** Rough macros for persistence (worker has richer table; UI can re-estimate). */
function roughMacros(r) {
  let kcal = 0,
    prot = 0,
    carb = 0,
    fat = 0;
  const per100 = [
    [/helmjölk|mjölk|milk/i, 64, 3.4, 4.8, 3.5],
    [/proteinpulver|whey/i, 370, 80, 5, 5],
    [/keso|cottage/i, 98, 11, 3, 4],
    [/lönn|maple|honung|honey|sirap/i, 260, 0, 70, 0],
    [/vanilj/i, 280, 0, 12, 0],
    [/espresso|kaffe/i, 2, 0.1, 0, 0],
    [/kyckling/i, 110, 23, 0, 1.5],
    [/sojasås|soy/i, 60, 10, 5, 0],
    [/ägg/i, 155, 13, 1, 11],
    [/majsstärkelse|stärkelse/i, 350, 0, 85, 0],
    [/gochujang/i, 220, 5, 45, 2],
    [/ketchup/i, 100, 1, 25, 0],
    [/vinäger|vinegar/i, 20, 0, 1, 0],
    [/ris\b|rice/i, 350, 7, 77, 1],
    [/peppar|salt|sötning|stevia/i, 0, 0, 0, 0],
  ];
  function grams(ing) {
    const a = Number(ing.amount) || 0;
    const u = ing.unit;
    if (u === 'g') return a;
    if (u === 'msk') return a * 15;
    if (u === 'tsk') return a * 5;
    if (u === 'st' && /ägg/i.test(ing.name || '')) return a * 55;
    return 0;
  }
  for (const g of r.groups || []) {
    for (const ing of g.ingredients || []) {
      const gAmt = grams(ing);
      if (!gAmt) continue;
      const row = per100.find(([re]) => re.test(ing.name || ''));
      if (!row) continue;
      const [, k, p, c, f] = row;
      const fct = gAmt / 100;
      kcal += k * fct;
      prot += p * fct;
      carb += c * fct;
      fat += f * fct;
    }
  }
  return {
    kcal: Math.round(kcal),
    prot: Math.round(prot),
    carb: Math.round(carb),
    fat: Math.round(fat),
  };
}

const IDS = ['protein-affogato', 'popcorn-kyckling-med-koreansk-glasyr-och-klibbigt-ris'];

const res = await fetch('https://receptbok.receptbok.workers.dev/api/recipes');
const { recipes } = await res.json();

const statements = [];
for (const id of IDS) {
  const raw = recipes.find((r) => r.id === id);
  if (!raw) {
    console.error('missing', id);
    continue;
  }
  const r = JSON.parse(JSON.stringify(raw));
  delete r.updatedAt;
  delete r.createdAt;
  normalizeIngredientMeasures(r);
  r.macros = roughMacros(r);
  console.log(id, 'macros', r.macros);
  for (const g of r.groups || []) {
    console.log(' #', g.name);
    for (const i of g.ingredients || []) console.log('  ', i.amount, i.unit, i.name);
  }
  const json = JSON.stringify(r).replace(/'/g, "''");
  statements.push(
    `UPDATE recipes SET data = '${json}', updated_at = datetime('now') WHERE id = '${id}';`
  );
}

const out = join(root, 'scripts/fix-fake-gram-amounts.sql');
writeFileSync(out, statements.join('\n') + '\n');
console.log('wrote', out, statements.length);
