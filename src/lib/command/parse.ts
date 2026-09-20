import { resolveCategory, type CategoryDefinition } from '@/lib/discovery/categories';
import { normalizeText } from '@/lib/normalize/text';

/**
 * Natural-language command parsing.
 *
 * Deliberately deterministic and rule-based, in German and English. It turns a
 * sentence into a *structured request* that is then executed by exactly the
 * same code paths as the forms — so a typed command can never skip identity or
 * website verification, and it can never invent a result.
 *
 * Anything the parser is unsure about is returned as `unknown` with a
 * suggestion, rather than being guessed at.
 */

export interface ResearchCommand {
  kind: 'research';
  location: string;
  radiusKm: number;
  category: string | null;
  categoryLabel: string;
  count: number;
  /** What the parser understood, shown back to the user before running. */
  explanation: string;
  assumptions: string[];
}

export interface FilterCommand {
  kind: 'filter';
  scope: 'leads' | 'pool';
  filters: {
    search?: string;
    websiteStatus?: string[];
    leadStatus?: string[];
    assignedUserId?: string;
    openNow?: boolean;
    uncalled?: boolean;
    callbackDue?: boolean;
    qualifiedOnly?: boolean;
  };
  explanation: string;
}

export interface UnknownCommand {
  kind: 'unknown';
  explanation: string;
  suggestions: string[];
}

export type ParsedCommand = ResearchCommand | FilterCommand | UnknownCommand;

export const DEFAULT_RADIUS_KM = 15;
export const DEFAULT_COUNT = 20;
export const MAX_COUNT = 100;
export const MAX_RADIUS_KM = 50;

const RESEARCH_VERBS = [
  'find', 'search', 'build', 'get', 'research', 'discover', 'look for', 'generate',
  'finde', 'suche', 'such', 'baue', 'erstelle', 'recherchiere', 'zeige mir neue',
];

const FILTER_VERBS = ['show', 'list', 'display', 'zeig', 'zeige', 'liste', 'anzeigen'];

const LOCATION_PREPOSITIONS = [
  'around', 'near', 'in', 'of', 'for', 'at', 'close to', 'within reach of',
  'um', 'bei', 'nahe', 'rund um', 'fuer', 'in der naehe von', 'im raum',
];

const STOP_WORDS = new Set([
  'with', 'without', 'that', 'which', 'who', 'and', 'or', 'but', 'no', 'not',
  'mit', 'ohne', 'die', 'das', 'der', 'und', 'oder', 'aber', 'keine', 'kein',
  'radius', 'km', 'kilometer', 'kilometre', 'kilometres', 'kilometers', 'miles',
  'new', 'neue', 'neuen', 'leads', 'lead', 'liste', 'list', 'businesses', 'firmen',
]);

interface RadiusMatch {
  radiusKm: number | null;
  cleaned: string;
}

/** Pulls "within 15 km", "15km radius", "im Umkreis von 20 km" out of the text. */
function extractRadius(input: string): RadiusMatch {
  const patterns: RegExp[] = [
    /\b(?:within|in einem radius von|im umkreis von|umkreis|radius(?: of| von)?)\s*(\d{1,3})\s*(km|kilometer|kilometre|kilometres|kilometers)\b/i,
    /\b(\d{1,3})\s*(km|kilometer|kilometre|kilometres|kilometers)\s*(?:radius|umkreis)?\b/i,
  ];
  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match?.[1]) {
      const value = Number.parseInt(match[1], 10);
      if (Number.isFinite(value) && value > 0) {
        return {
          radiusKm: Math.min(MAX_RADIUS_KM, value),
          cleaned: input.replace(match[0], ' '),
        };
      }
    }
  }
  return { radiusKm: null, cleaned: input };
}

/** Pulls a requested lead count, ignoring numbers that belong to a radius. */
function extractCount(input: string): { count: number | null; cleaned: string } {
  const match = input.match(/\b(\d{1,3})\b/);
  if (!match?.[1]) return { count: null, cleaned: input };
  const value = Number.parseInt(match[1], 10);
  if (!Number.isFinite(value) || value <= 0) return { count: null, cleaned: input };
  return { count: Math.min(MAX_COUNT, value), cleaned: input.replace(match[0], ' ') };
}

function extractLocation(input: string): string | null {
  const text = ` ${input.replace(/\s+/g, ' ').trim()} `;
  // Longest prepositions first so "in der naehe von" beats "in".
  const prepositions = [...LOCATION_PREPOSITIONS].sort((a, b) => b.length - a.length);

  for (const preposition of prepositions) {
    const index = text.toLowerCase().lastIndexOf(` ${preposition} `);
    if (index === -1) continue;
    const rest = text.slice(index + preposition.length + 2);
    const words: string[] = [];
    for (const word of rest.split(' ')) {
      const clean = word.replace(/[.,!?;:]+$/, '').trim();
      if (!clean) continue;
      if (STOP_WORDS.has(normalizeText(clean))) break;
      words.push(clean);
      // Place names are rarely longer than three words.
      if (words.length >= 3) break;
    }
    if (words.length > 0) return words.join(' ');
  }
  return null;
}

function matchesAny(text: string, needles: string[]): boolean {
  const normalized = ` ${normalizeText(text)} `;
  return needles.some((needle) => normalized.includes(` ${normalizeText(needle)} `) || normalized.includes(`${normalizeText(needle)} `));
}

export interface ParseOptions {
  defaultRadiusKm?: number;
  defaultCount?: number;
}

export function parseCommand(input: string, options: ParseOptions = {}): ParsedCommand {
  const raw = input.trim();
  if (raw.length < 3) {
    return {
      kind: 'unknown',
      explanation: 'The command was too short to understand.',
      suggestions: defaultSuggestions(),
    };
  }

  const filter = parseFilterCommand(raw);
  if (filter) return filter;

  const looksLikeResearch =
    matchesAny(raw, RESEARCH_VERBS) || matchesAny(raw, ['lead list', 'leadliste', 'lead-liste', 'leads for', 'leads fuer']);

  const withoutRadius = extractRadius(raw);
  const withoutCount = extractCount(withoutRadius.cleaned);
  const location = extractLocation(withoutCount.cleaned);
  const category: CategoryDefinition | null = resolveCategory(withoutCount.cleaned);

  if (!location) {
    return {
      kind: 'unknown',
      explanation: looksLikeResearch
        ? 'That looks like a research request, but no location could be identified. Name a city, for example "around Gießen".'
        : 'The command could not be interpreted.',
      suggestions: defaultSuggestions(),
    };
  }

  const assumptions: string[] = [];
  const radiusKm = withoutRadius.radiusKm ?? options.defaultRadiusKm ?? DEFAULT_RADIUS_KM;
  if (withoutRadius.radiusKm === null) assumptions.push(`No radius given — using ${radiusKm} km.`);
  const count = withoutCount.count ?? options.defaultCount ?? DEFAULT_COUNT;
  if (withoutCount.count === null) assumptions.push(`No number given — looking for ${count} new leads.`);
  if (!category) assumptions.push('No category recognised — searching all business types.');

  return {
    kind: 'research',
    location,
    radiusKm,
    category: category?.key ?? null,
    categoryLabel: category?.label ?? 'Any business',
    count,
    explanation: `Research ${count} new ${category?.label.toLowerCase() ?? 'businesses'} within ${radiusKm} km of ${location}.`,
    assumptions,
  };
}

function parseFilterCommand(raw: string): FilterCommand | null {
  const normalized = normalizeText(raw);
  const isFilterVerb = matchesAny(raw, FILTER_VERBS);

  const wantsOpenNow = /\b(open (right )?now|currently open|jetzt geoeffnet|gerade geoeffnet|geoeffnet)\b/.test(normalized);
  const wantsUncalled =
    /\b(uncalled|not called|never called|nicht angerufen|ungerufen|noch nicht angerufen)\b/.test(normalized);
  const wantsCallbacks = /\b(callback|callbacks|rueckruf|rueckrufe|wiedervorlage)\b/.test(normalized);
  const wantsInterested = /\b(interested|interessiert)\b/.test(normalized);
  const wantsManual =
    /\b(manual|manually|manuell|manuelle pruefung|needs check|zu pruefen|unsicher|uncertain)\b/.test(normalized);
  const wantsQualified = /\b(qualified|qualifiziert|ready|no website|ohne website|kein website|keine website)\b/.test(normalized);

  if (!isFilterVerb && !wantsOpenNow && !wantsUncalled && !wantsCallbacks && !wantsManual) return null;

  const filters: FilterCommand['filters'] = {};
  const parts: string[] = [];

  if (wantsOpenNow) {
    filters.openNow = true;
    parts.push('open right now');
  }
  if (wantsUncalled) {
    filters.uncalled = true;
    parts.push('not called yet');
  }
  if (wantsCallbacks) {
    filters.callbackDue = true;
    parts.push('with a callback due');
  }
  if (wantsInterested) {
    filters.leadStatus = ['interested'];
    parts.push('marked interested');
  }
  if (wantsManual) {
    filters.websiteStatus = ['REQUIRES_MANUAL_CHECK', 'WEBSITE_UNCERTAIN', 'IDENTITY_UNVERIFIED'];
    parts.push('needing manual verification');
  }
  if (wantsQualified) {
    filters.qualifiedOnly = true;
    parts.push('verified as having no website');
  }

  if (parts.length === 0) return null;

  const scope: FilterCommand['scope'] = wantsManual && !wantsUncalled && !wantsCallbacks ? 'pool' : 'leads';
  return {
    kind: 'filter',
    scope,
    filters,
    explanation: `Show ${scope === 'pool' ? 'researched businesses' : 'leads'} ${parts.join(' and ')}.`,
  };
}

export function defaultSuggestions(): string[] {
  return [
    'Build me a lead list for Frankfurt',
    'Find 20 barbers around Gießen',
    'Find restaurants within 15 km of Frankfurt',
    "Show today's uncalled leads",
    'Show leads that are open right now',
    'Show businesses needing manual verification',
  ];
}

/** Turns a filter command into a query string for the list pages. */
export function filterCommandToQuery(command: FilterCommand): string {
  const params = new URLSearchParams();
  if (command.filters.websiteStatus) params.set('website', command.filters.websiteStatus.join(','));
  if (command.filters.leadStatus) params.set('status', command.filters.leadStatus.join(','));
  if (command.filters.openNow) params.set('openNow', '1');
  if (command.filters.uncalled) params.set('uncalled', '1');
  if (command.filters.callbackDue) params.set('callback', '1');
  if (command.filters.qualifiedOnly) params.set('qualified', '1');
  return params.toString();
}
