/**
 * Rensar bort deprecated taggar i D1 och sparar infererade taggar.
 * Kör: npx tsx scripts/migrate-tags.mjs && cd worker && npx wrangler d1 execute receptbok-db --remote --file=../scripts/migrate-tags.sql
 */
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { normalizeRecipe } from '../worker/src/validate.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const workerDir = join(root, 'worker');
const outFile = join(root, 'scripts', 'migrate-tags.sql');

const raw = execSync(
  'npx wrangler d1 execute receptbok-db --remote --command "SELECT id, data FROM recipes" --json',
  { cwd: workerDir, encoding: 'utf8' }
);
const parsed = JSON.parse(raw);
const rows = parsed[0]?.results || [];

const lines = ['-- migrate-tags: strip ugn/airfryer/stekpanna/tillbehor'];
for (const row of rows) {
  const recipe = JSON.parse(row.data);
  normalizeRecipe(recipe);
  const data = JSON.stringify(recipe).replace(/'/g, "''");
  lines.push(`UPDATE recipes SET data = '${data}' WHERE id = '${row.id}';`);
}

writeFileSync(outFile, lines.join('\n') + '\n');
console.log(`Wrote ${rows.length} updates to ${outFile}`);
