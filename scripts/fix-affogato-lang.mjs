#!/usr/bin/env node
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const res = await fetch('https://receptbok.receptbok.workers.dev/api/recipes');
const { recipes } = await res.json();
const raw = recipes.find((r) => r.id === 'protein-affogato');
if (!raw) throw new Error('missing protein-affogato');

const r = JSON.parse(JSON.stringify(raw));
delete r.updatedAt;
delete r.createdAt;
r.title = 'Affogato';
for (const g of r.groups || []) {
  for (const i of g.ingredients || []) {
    if (/fullfet\s+keso/i.test(i.name)) i.name = 'keso 4%';
  }
}
for (const s of r.steps || []) {
  s.text = String(s.text || '')
    .replace(/\bpå\s+["«»']?\s*lite\s+glass\s*["«»']?\s*-?\s*läget/gi, 'på "Lite Ice Cream"-läget')
    .replace(/["«»']\s*lite\s+glass\s*["«»']\s*-?\s*läget/gi, '"Lite Ice Cream"-läget')
    .replace(/\blite\s+glass[\s-]*läge(?:t)?/gi, '"Lite Ice Cream"-läget')
    .replace(/\b(mixa|kör)\s+"Lite Ice Cream"-läget/gi, '$1 på "Lite Ice Cream"-läget')
    .replace(/\bpå\s+på\s+"/gi, 'på "')
    .replace(/\brespinna\b/gi, 'Kör Re-spin');
}
r.badges = ['1 portion', '15 min'];

const out = join(__dirname, 'fix-affogato-lang.sql');
const json = JSON.stringify(r).replace(/'/g, "''");
writeFileSync(out, `UPDATE recipes SET data = '${json}', updated_at = datetime('now') WHERE id = 'protein-affogato';\n`);
console.log('wrote', out);
console.log(r.title, r.groups.find((g) => /ost/i.test(g.name))?.ingredients?.[0]);
console.log(r.steps[1]?.text?.slice(0, 120));
