UPDATE recipes SET data = json_set(data, '$.title', 'Runda hoagiebullar'), updated_at = datetime('now') WHERE id = 'hoagie-brod';
UPDATE recipes SET data = json_set(data, '$.title', 'Kycklingkebab-wraps'), updated_at = datetime('now') WHERE id = 'chicken-kebab-wraps';
