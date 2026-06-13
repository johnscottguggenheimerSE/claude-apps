import type { Recipe } from './validate';

export interface RecipeRow {
  id: string;
  data: string;
  featured_new: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export function rowToRecipe(row: RecipeRow): Recipe {
  return JSON.parse(row.data) as Recipe;
}

export async function listRecipes(db: D1Database): Promise<{ recipes: Recipe[]; featuredNewIds: string[] }> {
  const { results } = await db
    .prepare('SELECT * FROM recipes ORDER BY featured_new DESC, sort_order ASC, created_at ASC')
    .all<RecipeRow>();
  const rows = results || [];
  const featuredNewIds = rows.filter((r) => r.featured_new).map((r) => r.id);
  return { recipes: rows.map(rowToRecipe), featuredNewIds };
}

export async function getRecipe(db: D1Database, id: string): Promise<Recipe | null> {
  const row = await db.prepare('SELECT * FROM recipes WHERE id = ?').bind(id).first<RecipeRow>();
  return row ? rowToRecipe(row) : null;
}

export async function idExists(db: D1Database, id: string): Promise<boolean> {
  const row = await db.prepare('SELECT id FROM recipes WHERE id = ?').bind(id).first();
  return !!row;
}

export async function nextSortOrder(db: D1Database): Promise<number> {
  const row = await db.prepare('SELECT MAX(sort_order) AS m FROM recipes').first<{ m: number | null }>();
  return (row?.m ?? -1) + 1;
}

export async function insertRecipe(
  db: D1Database,
  recipe: Recipe,
  opts: { featuredNew?: boolean; sortOrder?: number }
): Promise<void> {
  const now = new Date().toISOString();
  const sortOrder = opts.sortOrder ?? (await nextSortOrder(db));
  await db
    .prepare(
      'INSERT INTO recipes (id, data, featured_new, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .bind(recipe.id, JSON.stringify(recipe), opts.featuredNew ? 1 : 0, sortOrder, now, now)
    .run();
}

export async function updateRecipe(db: D1Database, recipe: Recipe, featuredNew?: boolean): Promise<boolean> {
  const now = new Date().toISOString();
  const existing = await db.prepare('SELECT featured_new FROM recipes WHERE id = ?').bind(recipe.id).first<{ featured_new: number }>();
  if (!existing) return false;
  const featured = featuredNew !== undefined ? (featuredNew ? 1 : 0) : existing.featured_new;
  await db
    .prepare('UPDATE recipes SET data = ?, featured_new = ?, updated_at = ? WHERE id = ?')
    .bind(JSON.stringify(recipe), featured, now, recipe.id)
    .run();
  return true;
}

export async function markFeaturedSeen(db: D1Database, id: string): Promise<void> {
  await db.prepare('UPDATE recipes SET featured_new = 0 WHERE id = ?').bind(id).run();
}
