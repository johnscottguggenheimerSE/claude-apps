import {
  isCookingSprayName,
  isCitrusJuiceName,
  isOilLikeName,
  isZeroGramSpiceName,
} from './normalize';
import type { IngredientRow } from './types';

/**
 * Convert quantity+unit → grams using ingredient metadata when available.
 * Returns null when conversion is impossible (e.g. st without piece_weight).
 */
export function amountToGrams(
  amount: number,
  unit: string,
  rawOrNormalizedName: string,
  ingredient: IngredientRow | null
): number | null {
  const u = String(unit || '').toLowerCase();
  if (!Number.isFinite(amount) || amount <= 0) return 0;

  if (u === 'g') return amount;

  if (u === 'msk') {
    if (ingredient?.density_g_per_ml != null) return amount * 15 * ingredient.density_g_per_ml;
    if (isOilLikeName(rawOrNormalizedName)) return amount * 14;
    return amount * 15;
  }

  if (u === 'tsk') {
    if (ingredient?.density_g_per_ml != null) return amount * 5 * ingredient.density_g_per_ml;
    if (isOilLikeName(rawOrNormalizedName)) return amount * 4.5;
    return amount * 5;
  }

  if (u === 'st') {
    if (isCookingSprayName(rawOrNormalizedName)) return amount * 1.5;
    if (isCitrusJuiceName(rawOrNormalizedName)) return amount * 30;
    if (ingredient?.piece_weight_g != null && ingredient.piece_weight_g > 0) {
      return amount * ingredient.piece_weight_g;
    }
    return null;
  }

  if (u === 'pinch') {
    if (isCookingSprayName(rawOrNormalizedName)) return amount * 1.5;
    if (isZeroGramSpiceName(rawOrNormalizedName)) return 0;
    if (ingredient) return amount * 1;
    return 0;
  }

  if (u === 'näve') {
    if (isCookingSprayName(rawOrNormalizedName)) return amount * 1.5;
    // Default handful if ingredient known; otherwise 0 (negligible / unknown)
    if (ingredient) return amount * 20;
    return 0;
  }

  if (u === 'strimlor') return 0;

  return null;
}

export function macrosForGrams(ingredient: IngredientRow, grams: number): {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
} {
  const f = grams / 100;
  return {
    kcal: ingredient.kcal_per_100g * f,
    protein: ingredient.protein_per_100g * f,
    fat: ingredient.fat_per_100g * f,
    carbs: ingredient.carbs_per_100g * f,
  };
}
