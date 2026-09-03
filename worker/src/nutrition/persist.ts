import type { Recipe } from '../validate';
import { loadNutritionCatalog } from './catalog';
import { replaceRecipeIngredients } from './db';
import { resolveAndApplyRecipe } from './resolve';
import type { ResolveRecipeResult } from './types';

/** Drop any AI-/client-supplied macro fields before authoritative resolve. */
export function stripClientMacros(recipe: Recipe): Recipe {
  const next: Recipe = { ...recipe };
  delete next.macros;
  const groups = (next.groups || []) as {
    name?: string;
    ingredients?: Record<string, unknown>[];
  }[];
  next.groups = groups.map((g) => ({
    ...g,
    ingredients: (g.ingredients || []).map((ing) => {
      const copy = { ...ing };
      delete copy.macros;
      delete copy.match_status;
      delete copy.resolved_grams;
      delete copy.ingredient_id;
      return copy;
    }),
  }));
  return next;
}

export type PersistResolution = {
  recipe: Recipe;
  resolution: ResolveRecipeResult;
};

/** Resolve macros from catalog and mirror onto recipe JSON (no DB row writes). */
export async function resolveRecipeNutrition(
  db: D1Database,
  recipe: Recipe
): Promise<PersistResolution> {
  const catalog = await loadNutritionCatalog(db);
  const cleaned = stripClientMacros(recipe);
  return resolveAndApplyRecipe(catalog, cleaned);
}

/**
 * Dual-write: resolve → recipe JSON macros/match_status, then recipe_ingredients rows.
 * Call after recipes row exists (insert/update).
 */
export async function persistRecipeNutrition(
  db: D1Database,
  recipe: Recipe
): Promise<PersistResolution> {
  const result = await resolveRecipeNutrition(db, recipe);
  await replaceRecipeIngredients(db, String(result.recipe.id), result.resolution.rows);
  return result;
}
