// Owner classes for Property Appraiser owner names. Shared by scripts/difflib.ts and the site.
// Patterns come from the owner names actually on file for tracked parcels (see docs/data-sources.md).
const COUNTY = /^COUNTY OF VOL|^VOLUSIA COUNTY/;
const PUBLIC = new RegExp(
  [
    '^STATE OF FLORIDA', '^BOARD OF (TRUSTEES|TR)\\b', '^UNITED STATES', '^USA\\b', '^ST JOHNS RIVER WATER',
    '^CITY OF', '^TOWN OF', '^VILLAGE OF', 'COMMUNITY DEVELOPMENT DISTRICT$', '^FL(ORIDA)? (DOT|DEPARTMENT|DEPT|DIVISION|FISH)', '^SCHOOL BOARD',
  ].join('|'),
);
// Owners that are organizations, not people. Anything else private is treated as an individual, so a
// doubtful name is masked rather than shown. Legal-entity suffixes count anywhere in the name; words that
// are also surnames (CHURCH, BANK, CO) count only as the last word, since the roll lists people
// surname-first ("CHURCH JOHN A").
const ENTITY = /\b(LLC|L L C|INC|CORP|LP|LLP|LTD|REIT)\b/;
const ORG_LAST_WORD = /\b(CORPORATION|CO|COMPANY|SOCIETY|CONSERVANCY|ASSOCIATION|ASSN|FOUNDATION|BANK|PARTNERS|PARTNERSHIP|HOLDINGS|CHURCH)$/;

export function ownerClass(name) {
  const n = String(name ?? '').trim().toUpperCase();
  if (!n) return 'unknown';
  if (COUNTY.test(n)) return 'county';
  if (PUBLIC.test(n)) return 'public';
  return ENTITY.test(n) || ORG_LAST_WORD.test(n) ? 'organization' : 'individual';
}

export const OWNER_CLASS_LABELS = {
  county: 'Volusia County',
  public: 'another public agency',
  organization: 'a private organization',
  individual: 'a private individual',
  unknown: 'no owner on file',
};

// Private individuals' names stay in the raw snapshots but aren't shown on the site.
export const displayOwner = (name) => (ownerClass(name) === 'individual' ? '(private individual)' : String(name ?? ''));

const isPublic = (c) => c === 'county' || c === 'public';

// How serious an ownership change is for land tracked as conservation or as a Volusia Forever applicant.
export function ownerChangeKind(fromName, toName) {
  const from = ownerClass(fromName), to = ownerClass(toName);
  if (from === to) return null;
  if (isPublic(from) && !isPublic(to)) return 'left_public';
  if (!isPublic(from) && isPublic(to)) return 'became_public';
  return 'changed_hands';
}
