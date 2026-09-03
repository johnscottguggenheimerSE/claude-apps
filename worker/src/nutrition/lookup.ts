/**
 * Broader catalog lookup without dangerous substring matching.
 * Still exact key → alias map; we only try more candidate keys.
 *
 * Examples:
 *   kycklinglårfilé → kycklinglårfilé, kycklinglår
 *   (not bare "kyckling" — too generic / dish-collision risk)
 */

/** Stems too broad to use as fallback alone (many prepared dishes in SLV). */
const TOO_GENERIC = new Set([
  'kyckling',
  'nöt',
  'gris',
  'fläsk',
  'lamm',
  'fisk',
  'ost',
  'bröd',
  'pasta',
  'ris',
  'ägg',
  'kött',
  'sås',
  'mjölk',
  'yoghurt',
  'tomat',
  'lök',
  'olja',
  'smör',
  'socker',
  'salt',
  'peppar',
  'chili',
  'vinäger',
  'buljong',
]);

const COMPOUND_SUFFIXES = [
  'filé',
  'file',
  'filet',
  'bröstfilé',
  'lårfilé',
  'kött',
  'färs',
  'pulver',
  'pasta',
  'sås',
  'juice',
  'zest',
  'skal',
  'frön',
  'frö',
  'klyftor',
  'klyfta',
  'blad',
];

function isAcceptableKey(k: string): boolean {
  if (k.length < 3) return false;
  if (TOO_GENERIC.has(k)) return false;
  return true;
}

/** Generate lookup keys from most specific → broader. Deduped, longest first. */
export function expandLookupKeys(normalized: string): string[] {
  const n = String(normalized || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
  if (!n) return [];

  const keys: string[] = [];
  const push = (k: string) => {
    const t = k.replace(/\s+/g, ' ').trim();
    if (isAcceptableKey(t) && !keys.includes(t)) keys.push(t);
  };

  // Always allow the full normalized string even if "generic" (exact match OK)
  if (n.length >= 1 && !keys.includes(n)) keys.push(n);

  // Hyphen/compound variants
  push(n.replace(/-/g, ''));
  push(n.replace(/-/g, ' '));

  if (!/\s/.test(n) && n.length >= 8) {
    for (const suf of ['lårfilé', 'bröstfilé', 'lår', 'bröst', 'filé', 'färs', 'kött']) {
      if (n.endsWith(suf) && n.length > suf.length + 3) {
        const stem = n.slice(0, -suf.length);
        push(stem + ' ' + suf);
        push(stem + suf);
        push(stem); // filtered if TOO_GENERIC
      }
    }
  }

  for (const suf of COMPOUND_SUFFIXES) {
    if (n.endsWith(suf) && n.length > suf.length + 3) {
      const stem = n.slice(0, -suf.length).replace(/[-\s]+$/g, '');
      push(stem);
    }
  }

  let parts = n.split(/\s+/).filter(Boolean);
  while (parts.length > 1) {
    parts = parts.slice(0, -1);
    push(parts.join(' '));
  }

  return keys.sort((a, b) => b.length - a.length || a.localeCompare(b, 'sv'));
}
