/** Måltidstyp — inte kök/stil (asiatisk) eller mattyp (bakning som kategori). */
const VALID_CATEGORIES = ['frukost', 'lunch', 'middag', 'tillbehor', 'fika'];

const DEPRECATED_CATEGORIES: Record<string, string> = {
  asiatisk: 'middag',
  sallad: 'tillbehor',
  bakning: 'fika',
};

/** Per-recept när auto-mappning från gammal kategori räcker inte. */
const RECIPE_CATEGORY_OVERRIDES: Record<string, string> = {
  'thai-basil-beef-rolls': 'lunch',
  'rice-paper-shrimp-pancake': 'lunch',
  'numbing-chicken-cucumber': 'lunch',
  'tuna-chili-crisp-salad': 'lunch',
  'mexican-chicken-corn-salad': 'lunch',
};
const VALID_UNITS = ['g', 'msk', 'tsk', 'st', 'pinch', 'näve', 'strimlor'];
/** Filter-taggar — kategori (middag/asiatisk/…) är separat; ingen ugn/stekpanna/tillbehör. */
const TAG_FILTER_ORDER = [
  'hog-protein', 'snabb', 'laggkolhydrat', 'vegetarisk', 'meal-prep',
  'kyckling', 'notkott', 'flask', 'fisk', 'skaldjur',
];

const DEPRECATED_TAGS = new Set(['ugn', 'airfryer', 'stekpanna', 'tillbehor']);

export type Recipe = Record<string, unknown>;

function isUrl(s: unknown): boolean {
  return typeof s === 'string' && /^https?:\/\//i.test(s);
}

/** Minuter från badge- eller stegtext; intervall → högsta värde. */
function extractMinutesFromText(text: string): number | null {
  const m = text.match(/(\d+)(?:[–-](\d+))?\s*min/i);
  if (!m) return null;
  return m[2] ? parseInt(m[2], 10) : parseInt(m[1], 10);
}

function formatMinutesBadge(mins: number): string {
  return `${mins} min`;
}

/** Tid i badges: alltid «XX min» — inga ca/under/intervall i badge-text. */
export function normalizeBadgeLabel(b: string): string {
  if (/kcal|protein/i.test(b)) return b;
  const mins = extractMinutesFromText(b);
  if (mins != null) return formatMinutesBadge(mins);
  return b;
}

export function normalizeBadgeTimes(badges: string[]): string[] {
  return badges.map(normalizeBadgeLabel);
}

export function inferBadges(r: Recipe): string[] {
  const badges: string[] = [];
  const n = typeof r.baseServings === 'number' && r.baseServings > 0 ? r.baseServings : 1;
  badges.push(`${n} portioner`);
  const macros = r.macros as Record<string, number> | undefined;
  if (macros?.kcal) badges.push(`${Math.round(macros.kcal / n)} kcal/port`);
  if (macros?.prot) badges.push(`${Math.round(macros.prot / n)}g protein/port`);
  const tags = r.tags as string[] | undefined;
  if (tags?.includes('hog-protein')) badges.push('hög protein');
  if (tags?.includes('snabb')) badges.push('snabb');
  const steps = r.steps as { text?: string }[] | undefined;
  if (steps) {
    for (const step of steps) {
      const m = step.text?.match(/(?:ca\s+)?(?:under\s+)?(\d+(?:[–-]\d+)?)\s*min/i);
      if (m) {
        const mins = extractMinutesFromText(m[0]);
        if (mins != null) badges.push(formatMinutesBadge(mins));
        break;
      }
    }
  }
  return badges;
}

function ingredientText(r: Recipe): string {
  const groups = r.groups as { ingredients?: { name?: string }[] }[] | undefined;
  if (!groups) return '';
  return groups
    .flatMap((g) => g.ingredients?.map((i) => i.name || '') || [])
    .join(' ')
    .toLowerCase();
}

function looksSnabb(r: Recipe): boolean {
  if (r.tags && (r.tags as string[]).includes('snabb')) return true;
  const badges = r.badges as string[] | undefined;
  if (badges?.some((b) => /under\s*\d+\s*min|≤\s*30|(?:^|\s)30\s*min/i.test(b))) return true;
  const steps = r.steps as { text?: string }[] | undefined;
  if (steps) {
    for (const step of steps) {
      const m = step.text?.match(/(?:under\s+)?(\d+)\s*min/i);
      if (m && parseInt(m[1], 10) <= 30) return true;
    }
  }
  return false;
}

export function inferTags(r: Recipe): string[] {
  const tags: string[] = [];
  const n = typeof r.baseServings === 'number' && r.baseServings > 0 ? r.baseServings : 1;
  const macros = r.macros as Record<string, number> | undefined;
  if (macros?.prot && macros.prot / n >= 25) tags.push('hog-protein');
  if (looksSnabb(r)) tags.push('snabb');

  const ing = ingredientText(r);
  const proteinTags: Array<{ id: string; re: RegExp }> = [
    { id: 'kyckling', re: /kyckling|chicken|turkey|kalkon/i },
    { id: 'notkott', re: /nöt|beef|färs|biff|oxfil|entrecote|flank/i },
    { id: 'flask', re: /fläsk|pork|bacon|chorizo|prosciutto|pancetta|sausage/i },
    { id: 'fisk', re: /fisk|torsk|tonfisk|tuna|salmon|lax|sardine|makrill/i },
    { id: 'skaldjur', re: /räk|shrimp|prawn|krabba|crab|mussel|scallop|scampi/i },
  ];
  for (const { id, re } of proteinTags) {
    if (re.test(ing)) tags.push(id);
  }

  const vegHints = /tofu|tempeh|halloumi|bönor|beans|linser|quinoa|keso(?!l)/i;
  const meatHints = /kyckling|chicken|nöt|beef|fläsk|pork|bacon|fisk|torsk|tonfisk|räk|shrimp|korv|wurst/i;
  if (vegHints.test(ing) && !meatHints.test(ing)) tags.push('vegetarisk');

  const title = String(r.title || '').toLowerCase();
  if (/meal prep|meal-prep|lunchbox|wraps/i.test(title + ing)) tags.push('meal-prep');
  if (/lågkol|low carb|lchf/i.test(title + ing + String(r.badges?.join(' ') || ''))) {
    tags.push('laggkolhydrat');
  }

  return [...new Set(tags)];
}

export function sanitizeTags(tags: string[]): string[] {
  return tags.filter((t) => !DEPRECATED_TAGS.has(t) && TAG_FILTER_ORDER.includes(t));
}

export function migrateCategory(r: Recipe): string {
  const id = String(r.id || '');
  if (RECIPE_CATEGORY_OVERRIDES[id]) return RECIPE_CATEGORY_OVERRIDES[id];
  const cat = String(r.category || '');
  if (VALID_CATEGORIES.includes(cat)) return cat;
  if (DEPRECATED_CATEGORIES[cat]) return DEPRECATED_CATEGORIES[cat];
  return 'middag';
}

export function normalizeRecipe(r: Recipe): Recipe {
  if (!r.source || (typeof r.source === 'string' && !String(r.source).trim())) {
    r.source = 'Okänd källa';
  }
  if (r.sourceUrl == null) r.sourceUrl = '';
  if (!r.baseServings || (r.baseServings as number) < 1) r.baseServings = 1;
  r.category = migrateCategory(r);
  if (!Array.isArray(r.badges) || r.badges.length === 0) {
    r.badges = inferBadges(r);
  } else {
    r.badges = normalizeBadgeTimes(r.badges as string[]);
  }
  let tags = Array.isArray(r.tags) ? sanitizeTags(r.tags as string[]) : [];
  if (!tags.length) tags = inferTags(r);
  r.tags = tags;
  return r;
}

export function validateRecipe(
  r: Recipe,
  seenIds: Record<string, number>,
  opts?: { allowMissingImage?: boolean }
): string[] {
  const errors: string[] = [];
  const prefix = r.id ? `[${r.id}] ` : '';
  const allowMissingImage = opts?.allowMissingImage ?? false;

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
  if (!allowMissingImage && (!r.image || typeof r.image !== 'string')) {
    errors.push(`${prefix}saknar image`);
  }
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

export { TAG_FILTER_ORDER, VALID_CATEGORIES, VALID_UNITS, DEPRECATED_TAGS };
