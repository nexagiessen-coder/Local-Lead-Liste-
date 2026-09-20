/**
 * Text normalisation and similarity used by identity matching, deduplication
 * and website-candidate scoring.
 *
 * The rules are deliberately conservative: normalisation removes noise
 * (case, diacritics, punctuation, legal forms) but never removes tokens that
 * distinguish two real businesses.
 */

const TRANSLITERATIONS: Record<string, string> = {
  ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss',
  á: 'a', à: 'a', â: 'a', ã: 'a', å: 'a',
  é: 'e', è: 'e', ê: 'e', ë: 'e',
  í: 'i', ì: 'i', î: 'i', ï: 'i',
  ó: 'o', ò: 'o', ô: 'o', õ: 'o', ø: 'o',
  ú: 'u', ù: 'u', û: 'u',
  ñ: 'n', ç: 'c', ý: 'y', š: 's', ž: 'z', č: 'c', ł: 'l',
};

/** Legal forms and generic suffixes that carry no identifying information. */
const LEGAL_FORMS = new Set([
  'gmbh', 'mbh', 'ug', 'ag', 'kg', 'ohg', 'gbr', 'ev', 'eg', 'ek', 'kgaa',
  'haftungsbeschraenkt', 'co', 'cie',
  'ltd', 'limited', 'llc', 'inc', 'incorporated', 'plc', 'corp', 'corporation',
  'bv', 'nv', 'sarl', 'sa', 'srl', 'spa', 'oy', 'ab', 'as',
]);

/** Words so common in business names that they must never carry a match alone. */
const GENERIC_TOKENS = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des', 'und', 'oder', 'von', 'vom', 'zum',
  'zur', 'am', 'im', 'in', 'an', 'auf', 'bei', 'fuer', 'mit', 'the', 'and',
  'of', 'at', 'for', 'a', 'an',
  'salon', 'studio', 'shop', 'store', 'haus', 'house', 'center', 'centre',
  'zentrum', 'service', 'services', 'company', 'group', 'gruppe', 'team',
  'restaurant', 'cafe', 'bar', 'praxis', 'atelier', 'werkstatt', 'markt',
  'barbershop', 'barber', 'friseur', 'friseursalon', 'coiffeur', 'hair',
]);

/** Lowercases, transliterates, and strips punctuation. */
export function normalizeText(input: string | null | undefined): string {
  if (!input) return '';
  const out = input
    .toLowerCase()
    .replace(/[äöüßáàâãåéèêëíìîïóòôõøúùûñçýšžčł]/g, (ch) => TRANSLITERATIONS[ch] ?? ch)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  return out
    .replace(/&/g, ' und ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Normalised name with legal forms removed — the canonical business name key. */
export function normalizeBusinessName(input: string | null | undefined): string {
  const tokens = normalizeText(input).split(' ').filter(Boolean);
  const kept = tokens.filter((t) => !LEGAL_FORMS.has(t));
  return (kept.length > 0 ? kept : tokens).join(' ');
}

/** Tokens that actually identify a business (generic words removed). */
export function distinctiveTokens(name: string | null | undefined): string[] {
  return normalizeBusinessName(name)
    .split(' ')
    .filter((t) => t.length >= 2 && !GENERIC_TOKENS.has(t) && !LEGAL_FORMS.has(t));
}

export function isGenericToken(token: string): boolean {
  return GENERIC_TOKENS.has(token) || LEGAL_FORMS.has(token);
}

/** Levenshtein distance (iterative, O(n*m) time, O(m) space). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
    }
    const swap = prev;
    prev = curr;
    curr = swap;
  }
  return prev[b.length]!;
}

/** 0..1 similarity based on edit distance. */
export function stringSimilarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  return 1 - levenshtein(a, b) / maxLen;
}

/**
 * Name similarity combining token overlap (Jaccard over name tokens) with
 * whole-string similarity. Handles abbreviations and differing word order.
 */
export function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const na = normalizeBusinessName(a);
  const nb = normalizeBusinessName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const ta = new Set(na.split(' ').filter(Boolean));
  const tb = new Set(nb.split(' ').filter(Boolean));
  const intersection = [...ta].filter((t) => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  const jaccard = union === 0 ? 0 : intersection / union;

  // Containment: "Barber Shop Mueller" vs "Mueller Barber" — one name inside the other.
  const containment = intersection / Math.max(1, Math.min(ta.size, tb.size));

  const edit = stringSimilarity(na, nb);
  return Math.max(edit, jaccard * 0.6 + containment * 0.4);
}

/**
 * Fraction of the needle's distinctive tokens present in the haystack text.
 * Used to check whether a web page mentions the business name.
 */
export function tokenCoverage(needle: string, haystack: string): number {
  const tokens = distinctiveTokens(needle);
  if (tokens.length === 0) return 0;
  const hay = ` ${normalizeText(haystack)} `;
  const hits = tokens.filter((t) => hay.includes(t)).length;
  return hits / tokens.length;
}

/** Collapses whitespace; returns null for blank input. */
export function cleanString(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).replace(/\s+/g, ' ').trim();
  return trimmed === '' ? null : trimmed;
}
