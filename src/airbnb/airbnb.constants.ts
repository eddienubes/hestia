import type { AMENITY_NAMES } from "../amenities.constants";

/**
 * Non-exhaustive airbnb amenities list taken from the live DOM and graphql API.
 */
export const AMENITIES_TO_AIRBNB_AMENITY_IDS: Record<
  (typeof AMENITY_NAMES)[number],
  number
> = {
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
