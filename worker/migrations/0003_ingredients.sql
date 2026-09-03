-- Steg A: structured nutrition catalog + per-recipe resolved rows.
-- recipe_id is TEXT to match recipes.id (kebab-case slugs).

CREATE TABLE IF NOT EXISTS ingredients (
  id INTEGER PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  category TEXT,
  kcal_per_100g REAL,
  protein_per_100g REAL,
  fat_per_100g REAL,
  carbs_per_100g REAL,
  piece_weight_g REAL,
  density_g_per_ml REAL,
  needs_review INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ingredients_canonical
  ON ingredients(canonical_name);

CREATE TABLE IF NOT EXISTS ingredient_aliases (
  id INTEGER PRIMARY KEY,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  alias TEXT NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_ingredient_aliases_ingredient
  ON ingredient_aliases(ingredient_id);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id INTEGER PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  raw_text TEXT NOT NULL,
  quantity REAL,
  unit TEXT,
  ingredient_id INTEGER REFERENCES ingredients(id),
  resolved_grams REAL,
  kcal REAL,
  protein REAL,
  fat REAL,
  carbs REAL,
  match_status TEXT NOT NULL,
  group_index INTEGER NOT NULL DEFAULT 0,
  ingredient_index INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe
  ON recipe_ingredients(recipe_id);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_status
  ON recipe_ingredients(match_status);
