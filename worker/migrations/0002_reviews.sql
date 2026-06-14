CREATE TABLE IF NOT EXISTS recipe_reviews (
  recipe_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (recipe_id, visitor_id)
);

CREATE INDEX IF NOT EXISTS idx_recipe_reviews_recipe ON recipe_reviews(recipe_id);
