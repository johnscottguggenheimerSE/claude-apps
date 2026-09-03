import { amountToGrams, macrosForGrams } from './grams';
import { normalizeIngredientName } from './normalize';
import type {
  IngredientRow,
  MatchStatus,
  NutritionCatalog,
  ResolvedIngredient,
} from './types';

export function lookupAlias(catalog: NutritionCatalog, normalized: string): IngredientRow | null {
  if (!normalized) return null;
  return catalog.byAlias.get(normalized) ?? null;
}

/**
 * Resolve one ingredient line against the catalog.
 * Exact alias match only — never substring.
 */
export function resolveIngredientLine(
  catalog: NutritionCatalog,
  rawName: string,
  amount: number | null,
  unit: string | null,
  groupIndex: number,
  ingredientIndex: number
): ResolvedIngredient {
  const raw_text = String(rawName || '').trim();
  const quantity = amount != null && Number.isFinite(amount) ? amount : null;
  const unitNorm = unit != null ? String(unit).trim() || null : null;
  const normalized = normalizeIngredientName(raw_text);
  const ingredient = lookupAlias(catalog, normalized);

  const base: ResolvedIngredient = {
    raw_text,
    quantity,
    unit: unitNorm,
    ingredient_id: null,
    canonical_name: null,
    resolved_grams: null,
    kcal: null,
    protein: null,
    fat: null,
    carbs: null,
    match_status: 'unmatched',
    group_index: groupIndex,
    ingredient_index: ingredientIndex,
  };

  if (!ingredient) {
    return base;
  }

  base.ingredient_id = ingredient.id;
  base.canonical_name = ingredient.canonical_name;

  if (quantity == null || !unitNorm) {
    base.match_status = 'unmatched';
    return base;
  }

  const grams = amountToGrams(quantity, unitNorm, raw_text || normalized, ingredient);

  if (unitNorm === 'st' && grams == null) {
    base.match_status = 'needs_piece_weight';
    return base;
  }

  if (grams == null) {
    base.match_status = 'unmatched';
    return base;
  }

  base.resolved_grams = grams;
  if (grams > 0) {
    const m = macrosForGrams(ingredient, grams);
    base.kcal = m.kcal;
    base.protein = m.protein;
    base.fat = m.fat;
    base.carbs = m.carbs;
  } else {
    base.kcal = 0;
    base.protein = 0;
    base.fat = 0;
    base.carbs = 0;
  }
  base.match_status = 'matched' satisfies MatchStatus;
  return base;
}
