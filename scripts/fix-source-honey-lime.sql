UPDATE recipes SET data = json_set(data, '$.source', 'Okänd källa'), updated_at = datetime('now') WHERE id = 'honey-lime-teriyaki-beef-noodles';
