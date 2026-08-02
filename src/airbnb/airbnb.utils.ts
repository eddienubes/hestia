/** A single `{ filterName, filterValues }` entry in Airbnb's StaysSearch `rawParams` array. */
export interface AirbnbRawParam {
  filterName: string;
  filterValues: string[];
}

/** Builds one `rawParams` entry. All filter values are sent as strings, matching live traffic. */
export const buildRawParam = (filterName: string, ...filterValues: string[]): AirbnbRawParam => ({
  filterName,
  filterValues,
});

/** Builds the canonical public URL for a listing from its numeric id. */
export const buildListingUrl = (id: string): string => `https://www.airbnb.com/rooms/${id}`;

/**
 * Maps our domain's `flexibleTripLength` to the wire value Airbnb's search API expects in the
 * `flexibleTripLengths` rawParam. All three live-verified on 2026-08-02 by driving the "Flexible"
 * date-picker tab (Weekend/Week/Month options) in a real browser and diffing the resulting
 * StaysSearch request bodies:
 *   - "week"    -> "one_week"     (previously known; reconfirmed)
 *   - "weekend" -> "weekend_trip" (newly confirmed)
 *   - "month"   -> "one_month"    (newly confirmed)
 */
const TRIP_LENGTH_WIRE_VALUES = {
  weekend: "weekend_trip",
  week: "one_week",
  month: "one_month",
} as const satisfies Record<"weekend" | "week" | "month", string>;

export const tripLengthToWireValue = (length: "weekend" | "week" | "month"): string =>
  TRIP_LENGTH_WIRE_VALUES[length];

/**
 * Maps our domain's `propertyType` to the wire value Airbnb's search API expects in the
 * `roomTypes` rawParam. Live-verified on 2026-08-02 via the search page's "Type of place" filter:
 *   - "entire_home"  -> "Entire home/apt" (confirmed live)
 *   - "private_room" -> "Private room"    (confirmed live)
 *   - "shared_room"  -> "Shared room"     (INFERRED by symmetry with the other two, not directly
 *                        observed live — the simplified filter UI only exposes Any/Home/Room/Hotel,
 *                        with "Room" mapping to "Private room"; there's no separate UI toggle for
 *                        shared rooms to click. Airbnb's `roomTypes` taxonomy has used this exact
 *                        string historically, so this is a reasonable best-effort mapping rather
 *                        than a live-confirmed one.)
 *
 * `hotel_room` is deliberately NOT in this map: selecting "Hotel" in the UI does not set
 * `roomTypes` at all. Instead it adds a `kgAndTags: ["Tag:9613"]` rawParam (a knowledge-graph
 * category tag) - confirmed live on 2026-08-02. Callers must special-case `hotel_room` and use
 * `HOTEL_ROOM_TAG` below instead of this map.
 */
const ROOM_TYPE_WIRE_VALUES = {
  entire_home: "Entire home/apt",
  private_room: "Private room",
  shared_room: "Shared room",
} as const satisfies Record<"entire_home" | "private_room" | "shared_room", string>;

export const propertyTypeToRoomTypeWireValue = (
  propertyType: "entire_home" | "private_room" | "shared_room",
): string => ROOM_TYPE_WIRE_VALUES[propertyType];

/** The `kgAndTags` tag value for "Hotel room" property type - see comment above. Live-verified 2026-08-02. */
export const HOTEL_ROOM_TAG = "Tag:9613";

/**
 * Encodes a GraphQL global id the way Airbnb's Relay-based schema does: plain
 * base64("<TypeName>:<numericId>"). Confirmed live on 2026-08-02 by decoding ids returned from a
 * StaysSearch response (e.g. `demandStayListing.id`) and independently re-encoding them to build a
 * working StaysPdpSections request from a bare numeric listing id.
 */
export const encodeGlobalId = (typeName: string, id: string): string =>
  Buffer.from(`${typeName}:${id}`).toString("base64");

/**
 * Parses Airbnb's `avgRatingA11yLabel` search-result field, e.g.
 * "4.94 out of 5 average rating,  17 reviews", into structured values. Search results don't expose
 * separate numeric rating/review-count fields - this a11y label is the only place both numbers
 * appear together. Returns `{ value: null, reviewCount: 0 }` when the listing has no reviews yet
 * (Airbnb omits both fields entirely in that case).
 */
export const parseAvgRatingA11yLabel = (
  label: string | null | undefined,
): { value: number | null; reviewCount: number } => {
  if (!label) return { value: null, reviewCount: 0 };
  const match = /([\d.]+) out of 5 average rating,\s*([\d,]+) reviews?/.exec(label);
  if (!match) return { value: null, reviewCount: 0 };
  const [, ratingStr, countStr] = match as unknown as [string, string, string];
  return {
    value: Number.parseFloat(ratingStr),
    reviewCount: Number.parseInt(countStr.replace(/,/g, ""), 10),
  };
};

/**
 * Parses an Airbnb PDP overview item string (e.g. "2 guests", "1 bedroom", "1 bath") into a count.
 * Returns `undefined` when `items` has no entry matching `unitWord` (singular or plural).
 */
export const parseOverviewCount = (items: string[], unitWord: string): number | undefined => {
  for (const item of items) {
    const match = new RegExp(`^(\\d+)\\s+${unitWord}s?$`, "i").exec(item.trim());
    if (match?.[1]) return Number.parseInt(match[1], 10);
  }
  return undefined;
};
