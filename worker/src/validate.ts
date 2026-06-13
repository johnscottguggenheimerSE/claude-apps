const VALID_CATEGORIES = ['middag', 'asiatisk', 'sallad', 'bakning'];
const VALID_UNITS = ['g', 'msk', 'tsk', 'st', 'pinch', 'näve', 'strimlor'];
const TAG_FILTER_ORDER = [
  'hog-protein', 'snabb', 'laggkolhydrat', 'vegetarisk', 'meal-prep',
  'kyckling', 'notkott', 'flask', 'fisk', 'skaldjur',
  'ugn', 'airfryer', 'stekpanna', 'tillbehor',
];

export type Recipe = Record<string, unknown>;

function isUrl(s: unknown): boolean {
  return typeof s === 'string' && /^https?:\/\//i.test(s);
}

export function normalizeRecipe(r: Recipe): Recipe {
  if (!r.source || (typeof r.source === 'string' && !String(r.source).trim())) {
    r.source = 'Okänd källa';
  }
  if (r.sourceUrl == null) r.sourceUrl = '';
  if (!Array.isArray(r.badges)) r.badges = [];
  if (!r.baseServings || (r.baseServings as number) < 1) r.baseServings = 1;
  return r;
}

export function validateRecipe(r: Recipe, seenIds: Record<string, number>): string[] {
  const errors: string[] = [];
  const prefix = r.id ? `[${r.id}] ` : '';

  if (!r.id || typeof r.id !== 'string') errors.push(`${prefix}saknar id`);
  else if (seenIds[r.id]) errors.push(`${prefix}duplicerat id`);
  else seenIds[r.id] = 1;

  if (!r.title) errors.push(`${prefix}saknar title`);
  if (!r.source) errors.push(`${prefix}saknar source`);
  if (r.sourceUrl && r.sourceUrl !== '#' && !isUrl(r.sourceUrl)) {
    errors.push(`${prefix}sourceUrl ogiltig`);
  }
  if (!VALID_CATEGORIES.includes(r.category as string)) {
    errors.push(`${prefix}ogiltig category`);
  }
  const tags = r.tags as string[] | undefined;
  if (!tags?.length) errors.push(`${prefix}saknar tags`);
  else tags.forEach((t) => {
    if (!TAG_FILTER_ORDER.includes(t)) errors.push(`${prefix}okänd tag: ${t}`);
  });
  if (!r.image || typeof r.image !== 'string') errors.push(`${prefix}saknar image`);
  const macros = r.macros as Record<string, number> | undefined;
  if (!macros) errors.push(`${prefix}saknar macros`);
  else ['kcal', 'prot', 'carb', 'fat'].forEach((k) => {
    if (typeof macros[k] !== 'number' || macros[k] < 0) errors.push(`${prefix}macros.${k} ogiltigt`);
  });
  if (!r.baseServings || (r.baseServings as number) < 1) errors.push(`${prefix}baseServings ogiltigt`);
  const tips = r.tips as { title: string }[] | undefined;
  if (!tips || tips.length !== 4) errors.push(`${prefix}tips ska vara 4`);
  else if (tips[0]?.title !== 'Seattle') errors.push(`${prefix}första tips ska vara Seattle`);

  return errors;
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'recept';
}

export { TAG_FILTER_ORDER, VALID_CATEGORIES, VALID_UNITS };
