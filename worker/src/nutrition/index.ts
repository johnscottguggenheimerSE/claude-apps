export type {
  IngredientRow,
  MacroTotals,
  MatchStatus,
  NutritionCatalog,
  RecipeIngredientInput,
  ResolveRecipeResult,
  ResolvedIngredient,
} from './types';

export {
  normalizeIngredientName,
  isCookingSprayName,
  isOilLikeName,
  isCitrusJuiceName,
  isZeroGramSpiceName,
} from './normalize';

export { amountToGrams, macrosForGrams } from './grams';
export { lookupAlias, resolveIngredientLine } from './match';
export {
  roundMacros,
  resolveRecipeIngredients,
  applyResolutionToRecipe,
  resolveAndApplyRecipe,
} from './resolve';
export { loadNutritionCatalog, catalogFromSeed } from './catalog';
export {
  replaceRecipeIngredients,
  deleteRecipeIngredients,
  reassignRecipeIngredients,
  sumRecipeIngredientMacros,
} from './db';
export {
  stripClientMacros,
  resolveRecipeNutrition,
  persistRecipeNutrition,
} from './persist';
export type { PersistResolution } from './persist';
