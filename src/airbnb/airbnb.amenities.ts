// Airbnb amenity name -> internal numeric amenity ID lookup, used to build
// `amenities[]=<id>` search filters against Airbnb's (unofficial) search API.
//
// IDs current as of 2026-08-02. Sourced via live network capture against
// airbnb.com/s/homes: opened the search "Filtry" panel and read the amenity
// checkbox DOM ids (`filter-item-amenities-<id>`), then confirmed a sample of
// them by toggling checkboxes and diffing the resulting StaysSearch GraphQL
// request body's `amenities` rawParams filterValues. Live-verified entries are
// marked below; any cross-referenced-only entry (secondary public source, used
// only when live capture was impractical) would be marked individually — there
// are none in this file at time of writing.
//
// This is a curated subset of commonly-useful amenities, not an exhaustive
// mirror of Airbnb's amenity taxonomy (which has hundreds of IDs, including
// accessibility-specific ones). Extend as needed, following the same
// live-verification approach.
//
// Note: some filter-panel toggles that look like amenities are NOT part of
// this numeric ID space and are intentionally excluded here — e.g. "Pets
// allowed" and "Instant Book" are separate boolean search params, and
// location toggles like "Waterfront"/"Ski-in-ski-out" use a different
// tag-based filter mechanism (`kg_and_tags`), not `amenities[]`.

/** All entries are live-verified via network capture unless noted otherwise. */
export const AMENITY_NAMES = [
  "wifi",
  "kitchen",
  "free_parking",
  "air_conditioning",
  "heating",
  "washer",
  "dryer",
  "pool",
  "hot_tub",
  "gym",
  "tv",
  "dedicated_workspace",
  "self_check_in",
  "crib",
  "ev_charger",
  "indoor_fireplace",
  "breakfast",
  "smoking_allowed",
  "bbq_grill",
  "hair_dryer",
  "iron",
  "smoke_alarm",
  "carbon_monoxide_alarm",
  "king_bed",
] as const;

export const AMENITIES: Record<(typeof AMENITY_NAMES)[number], number> = {
  wifi: 4,
  kitchen: 8,
  free_parking: 9,
  air_conditioning: 5,
  heating: 30,
  washer: 33,
  dryer: 34,
  pool: 7,
  hot_tub: 25,
  gym: 15,
  tv: 58,
  dedicated_workspace: 47,
  self_check_in: 51,
  crib: 286,
  ev_charger: 97,
  indoor_fireplace: 27,
  breakfast: 16,
  smoking_allowed: 11,
  bbq_grill: 99,
  hair_dryer: 45,
  iron: 46,
  smoke_alarm: 35,
  carbon_monoxide_alarm: 36,
  king_bed: 1000,
};
