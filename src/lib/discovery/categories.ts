/**
 * Business category taxonomy.
 *
 * Maps a small internal vocabulary to provider-specific query terms and to the
 * words a user might type in German or English. Keeping this explicit (rather
 * than passing free text to providers) makes searches reproducible.
 */

export interface CategoryDefinition {
  key: string;
  label: string;
  labelDe: string;
  /** OpenStreetMap tag filters, as `key=value` pairs (OR-combined). */
  osmTags: string[];
  /** Google Places (New) `includedTypes`. */
  googleTypes: string[];
  /** Words users may type. Matched after normalisation. */
  synonyms: string[];
}

export const CATEGORIES: CategoryDefinition[] = [
  {
    key: 'barber',
    label: 'Barbers & hairdressers',
    labelDe: 'Friseure & Barbiere',
    osmTags: ['shop=hairdresser', 'shop=barber'],
    googleTypes: ['hair_salon', 'barber_shop'],
    synonyms: ['barber', 'barbers', 'barbershop', 'hairdresser', 'hair salon', 'friseur', 'friseure', 'frisoer', 'coiffeur', 'barbiere'],
  },
  {
    key: 'restaurant',
    label: 'Restaurants',
    labelDe: 'Restaurants',
    osmTags: ['amenity=restaurant'],
    googleTypes: ['restaurant'],
    synonyms: ['restaurant', 'restaurants', 'gastronomie', 'gaststaette', 'lokal', 'eatery'],
  },
  {
    key: 'cafe',
    label: 'Cafés & bakeries',
    labelDe: 'Cafés & Bäckereien',
    osmTags: ['amenity=cafe', 'shop=bakery'],
    googleTypes: ['cafe', 'bakery'],
    synonyms: ['cafe', 'cafes', 'kaffee', 'baeckerei', 'bakery', 'konditorei', 'coffee shop'],
  },
  {
    key: 'beauty',
    label: 'Beauty & nail studios',
    labelDe: 'Kosmetik & Nagelstudios',
    osmTags: ['shop=beauty', 'shop=cosmetics', 'leisure=spa'],
    googleTypes: ['beauty_salon', 'nail_salon', 'spa'],
    synonyms: ['beauty', 'kosmetik', 'kosmetikstudio', 'nagelstudio', 'nail', 'nails', 'spa', 'wellness'],
  },
  {
    key: 'fitness',
    label: 'Gyms & fitness studios',
    labelDe: 'Fitnessstudios',
    osmTags: ['leisure=fitness_centre', 'leisure=sports_centre'],
    googleTypes: ['gym', 'fitness_center'],
    synonyms: ['gym', 'gyms', 'fitness', 'fitnessstudio', 'sportstudio', 'crossfit'],
  },
  {
    key: 'craft',
    label: 'Trades & craftsmen',
    labelDe: 'Handwerk',
    osmTags: ['craft=plumber', 'craft=electrician', 'craft=carpenter', 'craft=painter', 'craft=roofer', 'shop=doityourself'],
    googleTypes: ['plumber', 'electrician', 'roofing_contractor', 'painter', 'general_contractor'],
    synonyms: ['handwerker', 'handwerk', 'klempner', 'elektriker', 'maler', 'dachdecker', 'schreiner', 'tischler', 'plumber', 'electrician', 'contractor', 'trades'],
  },
  {
    key: 'automotive',
    label: 'Car repair & automotive',
    labelDe: 'KFZ & Autowerkstätten',
    osmTags: ['shop=car_repair', 'shop=car', 'shop=tyres'],
    googleTypes: ['car_repair', 'car_dealer'],
    synonyms: ['autowerkstatt', 'kfz', 'werkstatt', 'auto', 'car repair', 'garage', 'reifen', 'tyres'],
  },
  {
    key: 'retail',
    label: 'Retail shops',
    labelDe: 'Einzelhandel',
    osmTags: ['shop=clothes', 'shop=shoes', 'shop=florist', 'shop=jewelry', 'shop=gift', 'shop=furniture'],
    googleTypes: ['clothing_store', 'shoe_store', 'florist', 'jewelry_store', 'furniture_store'],
    synonyms: ['laden', 'geschaeft', 'einzelhandel', 'retail', 'shop', 'boutique', 'blumen', 'florist'],
  },
  {
    key: 'health',
    label: 'Health practices',
    labelDe: 'Praxen & Gesundheit',
    osmTags: ['amenity=doctors', 'amenity=dentist', 'shop=optician', 'healthcare=physiotherapist'],
    googleTypes: ['doctor', 'dentist', 'physiotherapist'],
    synonyms: ['arzt', 'praxis', 'zahnarzt', 'physio', 'physiotherapie', 'optiker', 'doctor', 'dentist'],
  },
  {
    key: 'hospitality',
    label: 'Hotels & guest houses',
    labelDe: 'Hotels & Pensionen',
    osmTags: ['tourism=hotel', 'tourism=guest_house'],
    googleTypes: ['hotel', 'lodging'],
    synonyms: ['hotel', 'hotels', 'pension', 'gasthaus', 'guest house', 'unterkunft'],
  },
  {
    key: 'professional',
    label: 'Professional services',
    labelDe: 'Dienstleister & Kanzleien',
    osmTags: ['office=lawyer', 'office=accountant', 'office=estate_agent', 'office=insurance'],
    googleTypes: ['lawyer', 'accounting', 'real_estate_agency', 'insurance_agency'],
    synonyms: ['anwalt', 'kanzlei', 'steuerberater', 'makler', 'immobilien', 'versicherung', 'lawyer', 'accountant', 'real estate'],
  },
];

const BY_KEY = new Map(CATEGORIES.map((c) => [c.key, c]));

export function getCategory(key: string | null | undefined): CategoryDefinition | null {
  if (!key) return null;
  return BY_KEY.get(key) ?? null;
}

export function categoryLabel(key: string | null | undefined): string {
  return getCategory(key)?.label ?? 'Any business';
}

/**
 * Resolves free text ("barbers", "Friseure", "restaurant") to a category key.
 * Returns null when nothing matches confidently — the caller then searches all
 * categories rather than guessing.
 */
export function resolveCategory(input: string | null | undefined): CategoryDefinition | null {
  if (!input) return null;
  const needle = input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .trim();
  if (!needle) return null;

  for (const category of CATEGORIES) {
    if (category.key === needle) return category;
    for (const synonym of category.synonyms) {
      const normalized = synonym.replace(/[^a-z0-9 ]+/g, ' ').trim();
      if (needle === normalized) return category;
      // Whole-word containment, so "find barbers near" matches "barber".
      const pattern = new RegExp(`(^|\\s)${escapeRegExp(normalized)}(s|es)?(\\s|$)`);
      if (pattern.test(needle)) return category;
    }
  }
  return null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
