/** Shared domain types. These mirror the database schema. */

export type UserRole = 'admin' | 'member';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
  lastLoginAt: number | null;
}

/** How confident we are that we know *which* business this row is. */
export type IdentityStatus = 'CONFIRMED' | 'PROBABLE' | 'UNVERIFIED' | 'NEEDS_REVIEW';

export const IDENTITY_STATUS_LABELS: Record<IdentityStatus, string> = {
  CONFIRMED: 'Identity confirmed',
  PROBABLE: 'Identity probable',
  UNVERIFIED: 'Identity requires verification',
  NEEDS_REVIEW: 'Identity conflict — needs review',
};

export type WebsiteStatus =
  | 'NOT_CHECKED'
  | 'VERIFIED_WEBSITE'
  | 'PROBABLE_WEBSITE'
  | 'WEBSITE_UNCERTAIN'
  | 'VERIFIED_NO_WEBSITE'
  | 'REQUIRES_MANUAL_CHECK'
  | 'IDENTITY_UNVERIFIED';

export const WEBSITE_STATUS_LABELS: Record<WebsiteStatus, string> = {
  NOT_CHECKED: 'Not checked',
  VERIFIED_WEBSITE: 'Verified website',
  PROBABLE_WEBSITE: 'Probable website',
  WEBSITE_UNCERTAIN: 'Website uncertain',
  VERIFIED_NO_WEBSITE: 'Verified no website',
  REQUIRES_MANUAL_CHECK: 'Requires manual check',
  IDENTITY_UNVERIFIED: 'Identity requires verification',
};

export const WEBSITE_STATUS_TONE: Record<WebsiteStatus, 'neutral' | 'good' | 'info' | 'warn' | 'bad'> = {
  NOT_CHECKED: 'neutral',
  VERIFIED_WEBSITE: 'info',
  PROBABLE_WEBSITE: 'info',
  WEBSITE_UNCERTAIN: 'warn',
  VERIFIED_NO_WEBSITE: 'good',
  REQUIRES_MANUAL_CHECK: 'warn',
  IDENTITY_UNVERIFIED: 'warn',
};

/** The only status that may enter the "no website" prospecting list. */
export const QUALIFYING_WEBSITE_STATUS: WebsiteStatus = 'VERIFIED_NO_WEBSITE';

export interface OpeningHoursInterval {
  /** Minutes from local midnight. */
  start: number;
  end: number;
}

export interface OpeningHoursDay {
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  closed: boolean;
  intervals: OpeningHoursInterval[];
}

export interface OpeningHours {
  days: OpeningHoursDay[];
  /** Raw source string (e.g. an OSM `opening_hours` value) for auditability. */
  raw: string | null;
  timezone: string;
  /** Any part of the source we could not parse — surfaced in the UI. */
  unparsed: string[];
}

export interface Business {
  id: string;
  name: string;
  nameNormalized: string;
  category: string | null;
  categoryLabel: string | null;
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  city: string | null;
  cityNormalized: string | null;
  region: string | null;
  countryCode: string | null;
  lat: number | null;
  lon: number | null;
  phoneRaw: string | null;
  phoneE164: string | null;
  email: string | null;
  timezone: string | null;
  openingHours: OpeningHours | null;
  openingHoursSource: string | null;
  openingHoursVerifiedAt: number | null;
  identityStatus: IdentityStatus;
  identityConfidence: number;
  identitySignals: IdentitySignal[];
  websiteStatus: WebsiteStatus;
  websiteConfidence: number | null;
  websiteUrl: string | null;
  websiteCheckedAt: number | null;
  branchGroupKey: string | null;
  dedupeKeyPhone: string | null;
  dedupeKeyAddress: string | null;
  isDemoData: boolean;
  firstSeenAt: number;
  lastSeenAt: number;
  discoveredInRun: string | null;
  excludedAt: number | null;
  exclusionReason: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface IdentitySignal {
  key: string;
  label: string;
  value: string | null;
  strength: 'strong' | 'medium' | 'weak';
  present: boolean;
}

export type EvidenceStance = 'supports' | 'contradicts' | 'neutral';

export interface EvidenceItem {
  id?: string;
  kind: string;
  statement: string;
  detail: string | null;
  sourceLabel: string | null;
  sourceUrl: string | null;
  stance: EvidenceStance;
  createdAt?: number;
}

export type ChannelStatus = 'ok' | 'unavailable' | 'error' | 'skipped';

export interface ChannelResult {
  channel: WebsiteChannel;
  status: ChannelStatus;
  detail: string | null;
  candidatesFound: number;
}

export type WebsiteChannel =
  | 'provider_field'
  | 'search_engine'
  | 'domain_guess'
  | 'social_profile'
  | 'directory';

export const CHANNEL_LABELS: Record<WebsiteChannel, string> = {
  provider_field: 'Business profile website field',
  search_engine: 'Web search',
  domain_guess: 'Domain candidates',
  social_profile: 'Social profiles',
  directory: 'Business directories',
};

export type CandidateDecision = 'ACCEPTED' | 'PROBABLE' | 'REJECTED' | 'UNREACHABLE';

export interface CandidateSignal {
  key: string;
  label: string;
  points: number;
  detail: string | null;
}

export interface WebsiteCandidate {
  id?: string;
  url: string;
  finalUrl: string | null;
  domain: string;
  sourceChannel: WebsiteChannel;
  score: number;
  decision: CandidateDecision;
  decisionReason: string;
  signals: CandidateSignal[];
  httpStatus: number | null;
  fetchedAt: number | null;
}

export interface WebsiteVerification {
  id: string;
  businessId: string;
  status: WebsiteStatus;
  confidence: number;
  acceptedUrl: string | null;
  channels: ChannelResult[];
  summary: string | null;
  engineVersion: string;
  triggeredBy: string | null;
  runId: string | null;
  startedAt: number;
  finishedAt: number;
  candidates: WebsiteCandidate[];
  evidence: EvidenceItem[];
}

export interface LeadStatusDefinition {
  key: string;
  label: string;
  tone: 'neutral' | 'info' | 'good' | 'warn' | 'bad';
  sortOrder: number;
  isActive: boolean;
  isTerminal: boolean;
  isCallable: boolean;
}

export interface Lead {
  id: string;
  businessId: string;
  status: string;
  assignedUserId: string | null;
  priority: number;
  qualification: QualificationResult | null;
  callCount: number;
  lastCallAt: number | null;
  lastCallBy: string | null;
  nextCallbackAt: number | null;
  lockedBy: string | null;
  lockedAt: number | null;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface CallAttempt {
  id: string;
  leadId: string;
  businessId: string;
  userId: string;
  phoneE164: string | null;
  startedAt: number;
  outcome: string | null;
  note: string | null;
  callbackAt: number | null;
  durationSeconds: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface Note {
  id: string;
  businessId: string;
  leadId: string | null;
  userId: string;
  body: string;
  createdAt: number;
}

export interface QualificationResult {
  qualifies: boolean;
  reasons: string[];
  blockers: string[];
  checkedAt: number;
}

export type ResearchRunStatus = 'running' | 'completed' | 'failed' | 'partial';

export interface ResearchRunStats {
  discovered: number;
  newBusinesses: number;
  duplicates: number;
  refreshed: number;
  needsReview: number;
  excluded: number;
  verified: number;
  verificationFailures: number;
  qualified: number;
}

export interface ResearchRun {
  id: string;
  createdBy: string | null;
  queryText: string | null;
  locationLabel: string;
  centerLat: number | null;
  centerLon: number | null;
  radiusKm: number;
  category: string | null;
  requestedCount: number;
  provider: string;
  status: ResearchRunStatus;
  stats: ResearchRunStats | null;
  error: string | null;
  startedAt: number;
  finishedAt: number | null;
}

export type RunItemOutcome =
  | 'new'
  | 'duplicate'
  | 'refreshed'
  | 'excluded'
  | 'needs_review'
  | 'rejected';
