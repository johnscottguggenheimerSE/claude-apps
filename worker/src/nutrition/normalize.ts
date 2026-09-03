/**
 * Explicit whitelist normalization for ingredient names.
 * No food-name substring guessing — only prep/variant stripping + simple Swedish plurals.
 */

const PREP_WORDS =
  'tärnad|tärnade|kuberad|kuberade|hackad|hackade|finhackad|finhackade|grovhackad|grovhackade|skivad|skivade|smashad|smashade|juliennad|juliennade|riven|rivna|persisk|persiska|färsk|färska|benfri|benfria|boneless|skinless|finriven|grovriven|tunt|fint|grovt|strimlad|strimlade|pressad|pressade|förstekt|blancherad|tinade|kärnor|borttagna';

const PREP_RE = new RegExp(`^(?:${PREP_WORDS})$`, 'i');

const TRAILING_MODIFIER_RE =
  /(?:,\s*)?(?:tunt\s+skivad|fint\s+tärnad|tunt\s+skivade|kärnor\s+borttagna|grön\s+del|vit\s+del|(?<![a-zåäö])i\s+olja|oljeinlagd|ej\s+tinade|med\s+lågt\s+kaloriinnehåll)\s*$/i;

/** Conservative Swedish plural → singular for pantry matching. */
const EXPLICIT_PLURALS: Record<string, string> = {
  champinjoner: 'champinjon',
  morötter: 'morot',
  potatisar: 'potatis',
  bananer: 'banan',
  tomater: 'tomat',
  körsbärstomater: 'körsbärstomat',
  ägg: 'ägg',
  sesamfrön: 'sesamfrö',
  vallmofrön: 'vallmofrö',
  linfrön: 'linfrö',
  chiliflingor: 'chiliflingor', // keep as-is; alias handles
  vitlöksklyftor: 'vitlöksklyfta',
  schalottenlökar: 'schalottenlök',
  jalapeños: 'jalapeño',
  pickles: 'pickles',
};

function singularizeToken(token: string): string {
  if (EXPLICIT_PLURALS[token]) return EXPLICIT_PLURALS[token];
  // Only safe automatic rule: -or plurals (champinjoner already mapped; lökar etc.)
  if (token.endsWith('or') && token.length > 4 && !token.endsWith('tor') && !/(smör|peppar)$/.test(token)) {
    return token.slice(0, -2);
  }
  return token;
}

function singularizePhrase(phrase: string): string {
  return phrase
    .split(/\s+/)
    .map((t) => singularizeToken(t))
    .join(' ')
    .trim();
}

/**
 * Normalize raw ingredient name for exact alias lookup.
 * - lowercase, trim
 * - drop parenthetical notes
 * - strip known prep prefixes/suffixes (whitelist)
 * - take first alternative before " eller " / " / "
 * - light plural→singular
 */
export function normalizeIngredientName(raw: string): string {
  let n = String(raw || '').toLowerCase().trim();
  if (!n) return '';

  n = n
    .replace(/\b(lätt|light|low[\s-]?cal(?:orie)?)\s*ketchup\b/gi, 'ketchup')
    .replace(/\bketchup\s+med\s+lågt\s+kaloriinnehåll\b/gi, 'ketchup')
    .replace(/\bketchup\s*\([^)]*kalor[^)]*\)/gi, 'ketchup')
    .replace(/\s*\([^)]*\)/g, ' ');

  // Explicit alternative rule: first option wins (not substring food matching).
  // If left side is a dangling hyphen ("avokado- eller olja"), take the right side.
  const ellerMatch = n.match(/^(.*?)\s+eller\s+(.*)$/i);
  if (ellerMatch) {
    const left = ellerMatch[1].trim();
    const right = ellerMatch[2].trim();
    n = left.endsWith('-') || left.length < 3 ? right : left;
  }
  const slashIdx = n.indexOf(' / ');
  if (slashIdx > 0) n = n.slice(0, slashIdx);

  n = n
    .replace(TRAILING_MODIFIER_RE, '')
    .replace(new RegExp(`,\\s*(?:${PREP_WORDS})(?:\\s+(?:och\\s+)?[\\wåäö-]*)*$`, 'i'), '')
    .replace(new RegExp(`^(?:${PREP_WORDS})\\s+`, 'i'), '')
    .replace(new RegExp(`\\s+(?:${PREP_WORDS})$`, 'i'), '')
    .replace(/\bpersisk(?:a)?\s+/gi, '')
    .replace(/\b(utan|med)\s+skinn\b/gi, '')
    .replace(/\b(with|without)\s+skin\b/gi, '')
    .replace(/\bskinless\b/gi, '')
    .replace(/\bboneless\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Drop leftover prep tokens that sit mid-phrase (e.g. still present)
  n = n
    .split(/\s+/)
    .filter((t) => !PREP_RE.test(t))
    .join(' ')
    .replace(/,\s*$/, '')
    .replace(/^\s*,\s*/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  n = singularizePhrase(n);
  return n;
}

export function isCookingSprayName(name: string): boolean {
  return /stekspray|olivoljespray|cooking\s*spray|oil\s*spray|\bpam\b|matlagningsspray/i.test(name);
}

export function isOilLikeName(name: string): boolean {
  return isCookingSprayName(name) || /olja|oil|smör|butter/i.test(name);
}

export function isCitrusJuiceName(name: string): boolean {
  return /citronsaft|limejuice|citronjuice|lemon\s*juice|lime\s*juice/i.test(name);
}

export function isZeroGramSpiceName(name: string): boolean {
  return /salt|peppar|pepper|\bmsg\b/i.test(name);
}
