// Mille Bornes card taxonomy.
//
// 5 mileage types (25/50/75/100/200), 5 hazards, 5 remedies, 4 safeties.
// Pairings encode the standard hazard ↔ remedy ↔ safety relationships.

export type MileValue = 25 | 50 | 75 | 100 | 200;

export type HazardType =
  | 'stop'
  | 'speed-limit'
  | 'out-of-gas'
  | 'flat-tire'
  | 'accident';

export type RemedyType =
  | 'roll'
  | 'end-of-limit'
  | 'gasoline'
  | 'spare-tire'
  | 'repairs';

export type SafetyType =
  | 'right-of-way'
  | 'driving-ace'
  | 'extra-tank'
  | 'puncture-proof';

export type CardCategory = 'mileage' | 'hazard' | 'remedy' | 'safety';

export type CardType =
  | `mile-${MileValue}`
  | `hazard-${HazardType}`
  | `remedy-${RemedyType}`
  | `safety-${SafetyType}`;

// Card identity is `id` + `type`. `category` is denormalized for ergonomic
// switch statements (`switch (card.category)` reads well and avoids string
// prefix checks at every call site); it is always derivable from `type` via
// `categoryOf()`. Mile value is NOT carried on the card — call
// `mileValueOf(card.type)` to get it. Carrying both `value` and `type` led
// to drift risk (see ADR 002) so the field was dropped.
export type Card = {
  readonly id: string;
  readonly type: CardType;
  readonly category: CardCategory;
};

// Hazard → required remedy.
// Note: Roll also removes Stop; End of Limit removes Speed Limit. The standard
// rule that "after most hazards you also need Roll to resume" is implemented
// in the core rule plugin (battle pile mechanics), not here.
export const HAZARD_TO_REMEDY: Readonly<Record<HazardType, RemedyType>> = {
  'stop': 'roll',
  'speed-limit': 'end-of-limit',
  'out-of-gas': 'gasoline',
  'flat-tire': 'spare-tire',
  'accident': 'repairs',
};

// Hazard → matching safety. (Right of Way matches both Stop and Speed Limit.)
export const HAZARD_TO_SAFETY: Readonly<Record<HazardType, SafetyType>> = {
  'stop': 'right-of-way',
  'speed-limit': 'right-of-way',
  'out-of-gas': 'extra-tank',
  'flat-tire': 'puncture-proof',
  'accident': 'driving-ace',
};

// Safety → hazards it immunizes against.
export const SAFETY_HAZARDS: Readonly<Record<SafetyType, ReadonlyArray<HazardType>>> = {
  'right-of-way': ['stop', 'speed-limit'],
  'driving-ace': ['accident'],
  'extra-tank': ['out-of-gas'],
  'puncture-proof': ['flat-tire'],
};

// Discriminator helpers — derive category + payload from CardType.
const HAZARD_PREFIX = 'hazard-';
const REMEDY_PREFIX = 'remedy-';
const SAFETY_PREFIX = 'safety-';
const MILE_PREFIX = 'mile-';

export function categoryOf(type: CardType): CardCategory {
  if (type.startsWith(HAZARD_PREFIX)) return 'hazard';
  if (type.startsWith(REMEDY_PREFIX)) return 'remedy';
  if (type.startsWith(SAFETY_PREFIX)) return 'safety';
  return 'mileage';
}

export function hazardOf(type: CardType): HazardType | null {
  return type.startsWith(HAZARD_PREFIX)
    ? (type.slice(HAZARD_PREFIX.length) as HazardType)
    : null;
}

export function remedyOf(type: CardType): RemedyType | null {
  return type.startsWith(REMEDY_PREFIX)
    ? (type.slice(REMEDY_PREFIX.length) as RemedyType)
    : null;
}

export function safetyOf(type: CardType): SafetyType | null {
  return type.startsWith(SAFETY_PREFIX)
    ? (type.slice(SAFETY_PREFIX.length) as SafetyType)
    : null;
}

export function mileValueOf(type: CardType): MileValue | null {
  if (!type.startsWith(MILE_PREFIX)) return null;
  return Number(type.slice(MILE_PREFIX.length)) as MileValue;
}
