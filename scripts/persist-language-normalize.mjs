#!/usr/bin/env node
/**
 * Persist language-normalized recipes to D1.
 * node scripts/persist-language-normalize.mjs
 * cd worker && npx wrangler d1 execute receptbok-db --remote --file=../scripts/persist-language-normalize.sql
 */
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Dynamic import of TS via node --experimental or duplicate: call live after deploy.
// Here we inline the same transforms by importing validate after deploy path:
const { normalizeRecipe } = await import(pathToFileURL(join(root, 'worker/src/validate.ts')).href);

const IDS = [
  'lax-avokado-crunch-bowl',
  'protein-affogato',
  'popcorn-kyckling-med-koreansk-glasyr-och-klibbigt-ris',
  'tuna-chili-crisp-salad',
  'street-corn-chicken-bowl',
  'cinnamon-sugar-donut-holes',
];

const res = await fetch('https://receptbok.receptbok.workers.dev/api/recipes');
const { recipes } = await res.json();
const statements = [];

for (const id of IDS) {
  const raw = recipes.find((r) => r.id === id);
  if (!raw) {
    console.warn('skip missing', id);
    continue;
  }
  const r = normalizeRecipe(JSON.parse(JSON.stringify(raw)));
  delete r.updatedAt;
  delete r.createdAt;
  console.log(id);
  for (const g of r.groups || []) {
    for (const i of g.ingredients || []) {
      if (/soja|gurka|lax|vanilj|avokado|tärnad/i.test(i.name)) console.log(' ', i.name);
    }
  }
  for (const s of r.steps || []) {
    if (/ringla|chilimajonnäs|avokado|soja|tärnad/i.test(s.text || '')) {
      console.log('  step:', (s.text || '').slice(0, 100));
    }
  }
  const json = JSON.stringify(r).replace(/'/g, "''");
  statements.push(
    `UPDATE recipes SET data = '${json}', updated_at = datetime('now') WHERE id = '${id}';`
  );
}

const out = join(root, 'scripts/persist-language-normalize.sql');
writeFileSync(out, statements.join('\n') + '\n');
console.log('wrote', out, statements.length);
