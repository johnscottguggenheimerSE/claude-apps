#!/usr/bin/env node
/**
 * Validerar recept/recipes.js. Kör: node scripts/validate-recipes.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const receptDir = path.join(root, 'recept');

const appJs = fs.readFileSync(path.join(receptDir, 'app.js'), 'utf8');
const tagMatch = appJs.match(/var TAG_FILTER_ORDER = (\[[\s\S]*?\n\]);/);
const catMatch = appJs.match(/const CATEGORY_ORDER = (\[[^\]]+\]);/);
if (!tagMatch || !catMatch) {
  console.error('Kunde inte parsa TAG_FILTER_ORDER / CATEGORY_ORDER från app.js');
  process.exit(1);
}

const sandbox = { console };
vm.runInNewContext(
  fs.readFileSync(path.join(receptDir, 'recipe-validate.js'), 'utf8') +
    '\n' +
    fs.readFileSync(path.join(receptDir, 'recipes.js'), 'utf8') +
    '\nvar TAG_FILTER_ORDER = ' + tagMatch[1] + ';\n' +
    'var CATEGORY_ORDER = ' + catMatch[1] + ';\n',
  sandbox
);

const TAG_FILTER_ORDER = sandbox.TAG_FILTER_ORDER;
const CATEGORY_ORDER = sandbox.CATEGORY_ORDER;
const RECIPES = sandbox.RECIPES;

const errors = sandbox.RecipeValidate.validateAll(RECIPES, TAG_FILTER_ORDER, CATEGORY_ORDER);

if (errors.length) {
  console.error('validate-recipes: ' + errors.length + ' fel\n');
  errors.forEach(function(e) { console.error('  • ' + e); });
  process.exit(1);
}

console.log('validate-recipes: OK (' + RECIPES.length + ' recept)');
