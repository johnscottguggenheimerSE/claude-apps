CREATE TABLE IF NOT EXISTS recipes (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  featured_new INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recipes_sort ON recipes(sort_order ASC);
