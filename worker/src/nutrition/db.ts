import type { ResolvedIngredient } from './types';

/** Replace all recipe_ingredients rows for a recipe (dual-write). */
export async function replaceRecipeIngredients(
  db: D1Database,
  recipeId: string,
  rows: ResolvedIngredient[]
): Promise<void> {
  const stmts: D1PreparedStatement[] = [
    db.prepare('DELETE FROM recipe_ingredients WHERE recipe_id = ?').bind(recipeId),
  ];

  for (const row of rows) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO recipe_ingredients (
            recipe_id, raw_text, quantity, unit, ingredient_id,
            resolved_grams, kcal, protein, fat, carbs, match_status,
            group_index, ingredient_index
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          recipeId,
          row.raw_text,
          row.quantity,
          row.unit,
          row.ingredient_id,
          row.resolved_grams,
          row.kcal,
          row.protein,
          row.fat,
          row.carbs,
          row.match_status,
          row.group_index,
          row.ingredient_index
        )
    );
  }

  await db.batch(stmts);
}

export async function deleteRecipeIngredients(db: D1Database, recipeId: string): Promise<void> {
  await db.prepare('DELETE FROM recipe_ingredients WHERE recipe_id = ?').bind(recipeId).run();
}

export async function reassignRecipeIngredients(
  db: D1Database,
  oldId: string,
  newId: string
): Promise<void> {
  await db
    .prepare('UPDATE recipe_ingredients SET recipe_id = ? WHERE recipe_id = ?')
    .bind(newId, oldId)
    .run();
}

export async function sumRecipeIngredientMacros(
  db: D1Database,
  recipeId: string
): Promise<{ kcal: number; prot: number; carb: number; fat: number } | null> {
  const row = await db
    .prepare(
      `SELECT
         COALESCE(SUM(kcal), 0) AS kcal,
         COALESCE(SUM(protein), 0) AS protein,
         COALESCE(SUM(carbs), 0) AS carbs,
         COALESCE(SUM(fat), 0) AS fat
       FROM recipe_ingredients
       WHERE recipe_id = ? AND match_status = 'matched'`
    )
    .bind(recipeId)
    .first<{ kcal: number; protein: number; carbs: number; fat: number }>();
  if (!row) return null;
  return {
    kcal: Math.round(row.kcal),
    prot: Math.round(row.protein),
    carb: Math.round(row.carbs),
    fat: Math.round(row.fat),
  };
}
