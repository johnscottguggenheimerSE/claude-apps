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
/** Filter-taggar — proteinkälla + diet (ej tid/makro-tagg). */
const TAG_FILTER_ORDER = [
  'kyckling', 'notkott', 'flask', 'fisk', 'skaldjur', 'vegetarisk', 'vegan',
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

export function inferTags(r: Recipe): string[] {
  const tags: string[] = [];
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

/** Privata vidarebefordrare — aldrig receptkälla om de inte är @handle/sajt. */
const FORWARDER_SOURCES = new Set([
  'antonia mariassy',
  'john scott',
  'john scott guggenheimer',
]);

type Ing = { name?: string; amount?: number; unit?: string };

function cupsToGrams(cups: number, name: string): number {
  if (/smör|butter/i.test(name)) return Math.round(cups * 227);
  // undvik att «mjölk» matchar «mjöl»
  if (/\bmjöl\b|flour|stärkelse|starch|socker|sugar|pulver|powder|kakao|cocoa/i.test(name)) {
    return Math.round(cups * 120);
  }
  if (/havre|oats/i.test(name)) return Math.round(cups * 90);
  if (/\bris\b|rice/i.test(name)) return Math.round(cups * 185);
  return Math.round(cups * 240);
}

/**
 * Gemini byter ibland cup/tbsp → unit "g" utan att räkna om siffran (1¼ cup → 1.25 g).
 * Remappa engelska enheter och laga uppenbara falska grammängder.
 */
function normalizeIngredientMeasures(r: Recipe): void {
  const groups = r.groups as { ingredients?: Ing[] }[] | undefined;
  if (!groups) return;

  for (const g of groups) {
    for (const ing of g.ingredients || []) {
      if (!ing || typeof ing !== 'object') continue;
      let amount = typeof ing.amount === 'number' ? ing.amount : Number(ing.amount);
      if (!Number.isFinite(amount)) continue;
      const name = String(ing.name || '');
      let unit = String(ing.unit || '')
        .toLowerCase()
        .trim()
        .replace(/\.$/, '');

      if (['tbsp', 'tablespoon', 'tablespoons', 'matsked', 'matskedar'].includes(unit)) {
        ing.unit = 'msk';
        ing.amount = amount;
        continue;
      }
      if (['tsp', 'teaspoon', 'teaspoons', 'tesked', 'teskedar'].includes(unit)) {
        ing.unit = 'tsk';
        ing.amount = amount;
        continue;
      }
      if (['cup', 'cups', 'kopp', 'koppar'].includes(unit)) {
        ing.amount = cupsToGrams(amount, name);
        ing.unit = 'g';
        continue;
      }
      if (unit === 'ml' || unit === 'milliliter' || unit === 'milliliters') {
        ing.amount = Math.round(amount);
        ing.unit = 'g';
        continue;
      }
      if (unit === 'dl') {
        ing.amount = Math.round(amount * 100);
        ing.unit = 'g';
        continue;
      }
      if (['oz', 'ounce', 'ounces'].includes(unit)) {
        ing.amount = Math.round(amount * 28.35);
        ing.unit = 'g';
        continue;
      }
      if (['lb', 'lbs', 'pound', 'pounds'].includes(unit)) {
        ing.amount = Math.round(amount * 453.6);
        ing.unit = 'g';
        continue;
      }
      if (['scoop', 'scoops'].includes(unit)) {
        ing.amount = Math.round(amount * 30);
        ing.unit = 'g';
        continue;
      }
      if (['shot', 'shots'].includes(unit) && /espresso|kaffe|coffee/i.test(name)) {
        ing.amount = Math.round(amount * 30);
        ing.unit = 'g';
        continue;
      }

      if (unit !== 'g' || amount <= 0 || amount > 16) continue;

      // Falsk cup→g: 1.25 g mjölk o.dyl.
      if (
        /mjölk|milk|grädde|cream|yoghurt|yogurt|vatten|water|buljong|stock|juice/i.test(name) &&
        amount <= 4 &&
        (amount !== Math.floor(amount) || amount <= 3)
      ) {
        ing.amount = cupsToGrams(amount, name);
        ing.unit = 'g';
        continue;
      }
      if (amount === 1 && /proteinpulver|protein powder|whey|kasein|casein/i.test(name)) {
        ing.amount = 30;
        continue;
      }
      if (
        amount >= 1 &&
        amount <= 3 &&
        Number.isInteger(amount) &&
        /espresso/i.test(name)
      ) {
        ing.amount = amount * 30;
        continue;
      }
      if (amount >= 2 && amount <= 6 && /keso|cottage/i.test(name)) {
        ing.unit = 'msk';
        continue;
      }
      if (
        amount >= 1 &&
        amount <= 4 &&
        /vaniljpasta|vaniljextrakt|vanilla (paste|extract)|lönnsirap|maple|honung|honey/i.test(name)
      ) {
        ing.unit = 'tsk';
        continue;
      }
      // Såser/pastor som 2–8 g ≈ troligen msk kvar från tbsp
      if (
        Number.isInteger(amount) &&
        amount >= 1 &&
        amount <= 8 &&
        /ketchup|gochujang|vinäger|vinegar|sojasås|soy|mirin|sesamolja|sesame oil|olja\b|oil\b|mayo|chili.?crisp|sambal|miso|tahini|honung|honey|sirap|syrup|pasta\b(?!.*pulver)/i.test(
          name
        ) &&
        !/salt|peppar|jäst|bakpulver|bikarbonat|kanel|vitlökspulver|krydda/i.test(name)
      ) {
        ing.unit = 'msk';
      }
    }
  }
}

/** Ord-för-ord-översättningar → svensk butiksnomenklatur. */
function normalizeIngredientName(name: string): string {
  let n = String(name || '').trim();
  if (!n) return n;

  n = n
    .replace(/\bfull[\s-]?fat\s+cottage\s+cheese\b/gi, 'keso 4%')
    .replace(/\b(low[\s-]?fat|reduced[\s-]?fat)\s+cottage\s+cheese\b/gi, 'keso 1,5%')
    .replace(/\b(fat[\s-]?free|non[\s-]?fat|skim)\s+cottage\s+cheese\b/gi, 'keso 0,1%')
    .replace(/\b(whole\s+milk\s+)?cottage\s+cheese\b/gi, 'keso 4%')
    .replace(/\bfullfet\s+keso\b/gi, 'keso 4%')
    .replace(/\bkeso\s*\((?:fullfet|full[\s-]?fat)\)/gi, 'keso 4%')
    .replace(/\bkeso\s*\((?:låg\s*fetthalt|low[\s-]?fat|lätt)\)/gi, 'keso 1,5%')
    .replace(/\bkeso\s+fullfet\b/gi, 'keso 4%')
    .replace(/\bkeso\s+lågfet(?:t)?\b/gi, 'keso 1,5%')
    .replace(/\bfullfet\s+grekisk\s+yoghurt\b/gi, 'grekisk yoghurt 10%')
    .replace(/\b(lågfet(?:t)?|lätt)\s+grekisk\s+yoghurt\b/gi, 'grekisk yoghurt 0%')
    .replace(/\bfull[\s-]?fat\s+greek\s+yoghurt?\b/gi, 'grekisk yoghurt 10%')
    .replace(/\b(nonfat|fat[\s-]?free|0%)\s+greek\s+yoghurt?\b/gi, 'grekisk yoghurt 0%')
    .replace(/\bwhole\s+milk\b/gi, 'helmjölk')
    .replace(/\bskim\s+milk\b/gi, 'lättmjölk')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .toLowerCase();

  return n;
}

/** Behåll produktlägen (Creami m.m.) — undvik «lite glass», «respinna». */
function normalizeStepText(text: string): string {
  let t = String(text || '');
  if (!t) return t;

  t = t
    .replace(/\bpå\s+["«»']?\s*lite\s+glass\s*["«»']?\s*-?\s*läget/gi, 'på "Lite Ice Cream"-läget')
    .replace(/["«»']\s*lite\s+glass\s*["«»']\s*-?\s*läget/gi, '"Lite Ice Cream"-läget')
    .replace(/\blite\s+glass[\s-]*läge(?:t)?/gi, '"Lite Ice Cream"-läget')
    .replace(/\b(mixa|kör)\s+"Lite Ice Cream"-läget/gi, '$1 på "Lite Ice Cream"-läget')
    .replace(/\bpå\s+på\s+"/gi, 'på "')
    .replace(/\brespinna\b/gi, 'Kör Re-spin')
    .replace(/\bre[\s-]?spinna\b/gi, 'Kör Re-spin')
    .replace(/\bKör\s+Kör\s+Re-spin/gi, 'Kör Re-spin')
    .replace(/\bkör\s+Kör\s+Re-spin/gi, 'Kör Re-spin');

  return t;
}

function normalizeRecipeLanguage(r: Recipe): void {
  const groups = r.groups as { ingredients?: { name?: string }[] }[] | undefined;
  if (groups) {
    for (const g of groups) {
      for (const ing of g.ingredients || []) {
        if (ing?.name) ing.name = normalizeIngredientName(String(ing.name));
      }
    }
  }
  const steps = r.steps as { title?: string; text?: string }[] | undefined;
  if (steps) {
    for (const s of steps) {
      if (s?.text) s.text = normalizeStepText(String(s.text));
    }
  }
}

export function normalizeRecipe(r: Recipe): Recipe {
  // Gemini returnerar ibland alternativa nycklar eller tom title
  if (!r.title || !String(r.title).trim()) {
    const alt =
      r.Title ?? r.name ?? r.Name ?? r.titel ?? r.Titel ?? r.recipeName ?? r.dish;
    if (alt != null && String(alt).trim()) r.title = String(alt).trim();
  }
  if (typeof r.title === 'string') {
    r.title = r.title
      .replace(/\b(hög\s*protein|högprotein|extra\s*protein|proteinrik|proteinpackad)\b/gi, '')
      .replace(/\bproteins?\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[\s\-–—]+|[\s\-–—]+$/g, '')
      .trim();
  }
  if ((!r.title || !String(r.title).trim()) && r.id && String(r.id) !== 'recept') {
    r.title = String(r.id)
      .split('-')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  if (!r.source || (typeof r.source === 'string' && !String(r.source).trim())) {
    r.source = 'Okänd källa';
  } else if (
    !String(r.source).includes('@') &&
    FORWARDER_SOURCES.has(String(r.source).trim().toLowerCase())
  ) {
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
  const tips = r.tips as { title?: string; text?: string }[] | undefined;
  if (tips?.[0] && /^för barn$/i.test(String(tips[0].title || '').trim())) {
    tips[0].title = 'Seattle';
  }
  normalizeIngredientMeasures(r);
  normalizeRecipeLanguage(r);
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
  else if (/\bproteins?\b/i.test(String(r.title)) || /\b(hög\s*protein|högprotein|extra\s*protein|proteinrik|proteinpackad)\b/i.test(String(r.title))) {
    errors.push(`${prefix}title får inte innehålla proteinkrav — använd badges/makros istället`);
  }
  if (!r.source) errors.push(`${prefix}saknar source`);
  if (r.sourceUrl && r.sourceUrl !== '#' && !isUrl(r.sourceUrl)) {
    errors.push(`${prefix}sourceUrl ogiltig`);
  }
  if (!VALID_CATEGORIES.includes(r.category as string)) {
    errors.push(`${prefix}ogiltig category`);
  }
  const tags = r.tags as string[] | undefined;
  if (tags) tags.forEach((t) => {
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
  const groups = r.groups as { name?: string; ingredients?: { name?: string; amount?: number; unit?: string }[] }[] | undefined;
  if (!groups || !groups.length) errors.push(`${prefix}saknar groups`);
  else {
    groups.forEach((g, gi) => {
      if (!g.name) errors.push(`${prefix}group ${gi} saknar name`);
      if (!g.ingredients || !g.ingredients.length) errors.push(`${prefix}group ${gi} saknar ingredients`);
      else g.ingredients.forEach((ing, ii) => {
        if (!ing.name) errors.push(`${prefix}ingrediens ${gi}/${ii} saknar name`);
        if (typeof ing.amount !== 'number') errors.push(`${prefix}ingrediens ${ing.name || gi + '/' + ii} saknar amount`);
        if (!VALID_UNITS.includes(String(ing.unit || ''))) {
          errors.push(`${prefix}ingrediens ${ing.name || gi + '/' + ii} ogiltig unit: ${ing.unit}`);
        }
      });
    });
  }
  const steps = r.steps as { title?: string; text?: string }[] | undefined;
  if (!steps || !steps.length) errors.push(`${prefix}saknar steps`);
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
