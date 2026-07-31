#!/usr/bin/env node
/**
 * Byter svenska recept-id till engelska i D1 + migrerar R2-bilder.
 * Kör: node scripts/rename-recipe-ids-to-english.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workerDir = join(__dirname, '../worker');
const API = 'https://receptbok.receptbok.workers.dev';

const RENAMES = [
  { oldId: 'hoagie-brod', newId: 'hoagie-bread' },
  { oldId: 'chokladbitsscones-med-4-ingredienser', newId: 'chocolate-chunk-scones-4-ingredients' },
  { oldId: 'kycklingfärs-med-mellanostern-smaker', newId: 'middle-eastern-chicken-mince' },
  { oldId: 'thai-kyckling-med-gurksallad', newId: 'thai-chicken-cucumber-salad' },
];

function slugify(id) {
  return id
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function runWrangler(args, remote = false) {
  const full = remote ? [...args, '--remote'] : args;
  execFileSync('npx', ['wrangler', ...full], { cwd: workerDir, stdio: 'inherit' });
}

function d1Execute(sql) {
  runWrangler(['d1', 'execute', 'receptbok-db', '--remote', '--command', sql]);
}

function imageKeyCandidates(id) {
  const slug = slugify(id);
  const keys = new Set([`recipes/${id}.jpg`, `recipes/${slug}.jpg`]);
  return [...keys];
}

function newImageRef(newId) {
  return `/api/images/recipes/${slugify(newId)}.jpg`;
}

async function fetchRecipe(id) {
  const res = await fetch(`${API}/api/recipes/${encodeURIComponent(id)}`);
  const data = await res.json();
  if (!res.ok || !data.recipe) throw new Error(`Kunde inte hämta ${id}: ${data.error || res.status}`);
  return data;
}

function migrateR2Image(oldId, newId) {
  const tmp = mkdtempSync(join(tmpdir(), 'recept-rename-'));
  const destKey = `recipes/${slugify(newId)}.jpg`;
  let copied = false;

  for (const key of imageKeyCandidates(oldId)) {
    const localFile = join(tmp, 'image.jpg');
    try {
      runWrangler(['r2', 'object', 'get', `receptbok-images/${key}`, '--file', localFile], true);
      runWrangler(['r2', 'object', 'put', `receptbok-images/${destKey}`, '--file', localFile, '--content-type', 'image/jpeg'], true);
      copied = true;
      for (const delKey of imageKeyCandidates(oldId)) {
        try {
          runWrangler(['r2', 'object', 'delete', `receptbok-images/${delKey}`], true);
        } catch (_) {}
      }
      break;
    } catch (_) {}
  }

  rmSync(tmp, { recursive: true, force: true });
  if (!copied) console.warn(`  ⚠ Ingen R2-bild hittades för ${oldId}`);
  else console.log(`  ✓ R2: ${destKey}`);
}

function renameInD1(oldId, newId, recipe, featuredNew) {
  const esc = (s) => String(s).replace(/'/g, "''");
  const recipeJson = esc(JSON.stringify({
    ...recipe,
    id: newId,
    image: newImageRef(newId),
  }));

  d1Execute(
    `INSERT INTO recipes (id, data, featured_new, sort_order, created_at, updated_at) ` +
    `SELECT '${esc(newId)}', '${recipeJson}', featured_new, sort_order, created_at, datetime('now') ` +
    `FROM recipes WHERE id = '${esc(oldId)}'`
  );
  d1Execute(`UPDATE recipe_reviews SET recipe_id = '${esc(newId)}' WHERE recipe_id = '${esc(oldId)}'`);
  d1Execute(`DELETE FROM recipes WHERE id = '${esc(oldId)}'`);
  console.log(`  ✓ D1: ${oldId} → ${newId}${featuredNew ? ' (featured)' : ''}`);
}

async function main() {
  for (const { oldId, newId } of RENAMES) {
    console.log(`\n${oldId} → ${newId}`);
    const { recipe, featuredNew } = await fetchRecipe(oldId);
    delete recipe.emoji;
    migrateR2Image(oldId, newId);
    renameInD1(oldId, newId, recipe, featuredNew);
  }
  console.log('\nKlart — alla svenska id bytta till engelska.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
