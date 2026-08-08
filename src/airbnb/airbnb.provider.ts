import type {
  AccommodationSearchProvider,
  NormalizedListingDetails,
  NormalizedListingDetailsParams,
  NormalizedListingSummary,
  NormalizedSearchParams,
  NormalizedSearchResult,
} from "../accommodation-search.provider.ts";
import { AMENITIES_TO_AIRBNB_AMENITY_IDS } from "./airbnb.constants.ts";
import type {
  AirbnbApiClient,
  AirbnbHost,
  AirbnbListingDetails,
  AirbnbSearchParams,
  AirbnbSearchResult,
} from "./airbnb.api-client.ts";
import {
  buildListingUrl,
  decodeGlobalId,
  parseAvgRatingA11yLabel,
  parseOverviewCount,
} from "./airbnb.utils.ts";

export class AirbnbProvider implements AccommodationSearchProvider {
  private readonly client: AirbnbApiClient;

  constructor(client: AirbnbApiClient) {
    this.client = client;
  }

  async search(params: NormalizedSearchParams): Promise<NormalizedSearchResult> {
    const amenityIds = params.amenities?.map((name) => AMENITIES_TO_AIRBNB_AMENITY_IDS[name as keyof typeof AMENITIES_TO_AIRBNB_AMENITY_IDS]);

    const searchParams: AirbnbSearchParams = {
      location: params.location,
      placeId: params.placeId,
      currency: params.currency,
      minPrice: params.minPrice,
      maxPrice: params.maxPrice,
      propertyType: params.propertyType,
      amenityIds,
      limit: params.limit,
      cursor: params.cursor,
      dateMode: params.dateMode,
      checkin: params.checkin,
      checkout: params.checkout,
      flexibleTripLength: params.flexibleTripLength,
      flexibleMonths: params.flexibleMonths,
    };

    const response = await this.client.search(searchParams);
    const results = response.data?.presentation?.staysSearch?.results;

    return {
      listings: (results?.searchResults ?? []).map((result) =>
        this.normalizeSearchResult(result, params),
      ),
      nextCursor: results?.paginationInfo?.pageCursors?.[0],
    };
  }

  async getListingDetails(
    params: NormalizedListingDetailsParams,
  ): Promise<NormalizedListingDetails> {
    const details = await this.client.getListingDetails(params.listingId, {
      checkin: params.checkin,
      checkout: params.checkout,
      adults: params.adults,
      children: params.children,
      infants: params.infants,
      pets: params.pets,
      currency: params.currency,
    });

    return this.normalizeListingDetails(details);
  }

  private normalizeSearchResult(
    result: AirbnbSearchResult,
    params: NormalizedSearchParams,
  ): NormalizedListingSummary {
    const id = result.demandStayListing ? decodeGlobalId(result.demandStayListing.id).id : "";

    const priceLine = result.structuredDisplayPrice?.primaryLine;
    // Both shapes are pre-formatted display strings (e.g. "$120", "US$1,234"), not raw numbers -
    // strip everything but digits/decimal point as a best-effort parse. Prefer the plain `price`
    // field (QualifiedDisplayPriceLine, qualifier "total"); fall back to the discounted/original
    // pair (DiscountedDisplayPriceLine, qualifier "monthly") used for flexible/monthly searches.
    const rawPriceStr = priceLine?.price ?? priceLine?.discountedPrice ?? priceLine?.originalPrice;
    const amount = rawPriceStr ? Number.parseFloat(rawPriceStr.replace(/[^0-9.]/g, "")) : 0;
    // The domain type only models "night" | "total" periods, but Airbnb's search price lines are
    // either qualifier "total" (exact-date search) or "monthly" (flexible/monthly search) - there's
    // no "night" qualifier observed at all here. A monthly total is still a total (just for a
    // month, not the whole stay or a single night), so map anything other than the literal "total"
    // qualifier to "total" too rather than mislabeling a monthly sum as a nightly rate.
    const period: "night" | "total" = "total";

    // Search results were already filtered server-side by params.propertyType when the caller
    // supplied it, so it's a real (if coarse) signal for roomType in that case. When no filter was
    // applied, AirbnbSearchResult carries no per-listing room-type field at all - fall back to
    // "entire_home" as an explicit, documented placeholder rather than silently guessing.
    const roomType = params.propertyType ?? "entire_home";

    // Search results don't expose a Superhost flag directly. `badges` occasionally surfaces a
    // "Superhost" text badge, so treat that as a positive (real, if inconsistent) signal; absence
    // of the badge does NOT confirm non-superhost status, so we never set this to `false` from it.
    const isSuperhost = result.badges.some((badge) => /superhost/i.test(badge.text))
      ? true
      : undefined;

    // AirbnbSearchResult has no occupancy/guest-count field at all. `guests` is required on the
    // domain type, so fall back to the occupancy the caller searched for (adults + children) as
    // the closest available proxy - this is the search's requested occupancy, NOT the listing's
    // actual max-guest capacity, which search results simply don't expose.
    const guests = params.adults + params.children;

    return {
      id,
      listingUrl: buildListingUrl(id),
      name: result.subtitle,
      propertyType: result.title,
      roomType,
      // Search results don't expose a clean text location label (only lat/lng via
      // demandStayListing.location.coordinate) - use the original search query text as a
      // reasonable stand-in/approximation rather than fabricating a label.
      locationLabel: params.location,
      price: { amount, currency: params.currency, period },
      rating: parseAvgRatingA11yLabel(result.avgRatingA11yLabel),
      thumbnailUrl: result.contextualPictures[0]?.baseUrl,
      guests,
      isSuperhost,
    };
  }

  private normalizeListingDetails(details: AirbnbListingDetails): NormalizedListingDetails {
    const id = details.id;

    return {
      id,
      listingUrl: buildListingUrl(id),
      name: details.title,
      description: (details.descriptionHtml ?? "").replace(/<[^>]*>/g, "").trim(),
      propertyType: this.propertyTypeFromOverviewTitle(details.overviewTitle),
      roomType: this.roomTypeFromOverviewTitle(details.overviewTitle),
      host: this.normalizeHost(details.host),
      // Falls back to an empty string in the rare case neither the LOCATION_DEFAULT section nor
      // the overview title carries any location text - real listings are expected to have one.
      locationLabel:
        details.location?.label ?? this.locationFromOverviewTitle(details.overviewTitle) ?? "",
      // `guests` is required on the domain type; overview items are expected to always include a
      // "N guests" entry for a real listing, but fall back to 1 (a single documented placeholder)
      // if parsing ever fails to find it, rather than leaving it undefined.
      guests: parseOverviewCount(details.overviewItems, "guest") ?? 1,
      bedrooms: parseOverviewCount(details.overviewItems, "bedroom"),
      beds: parseOverviewCount(details.overviewItems, "bed"),
      baths: parseOverviewCount(details.overviewItems, "bath"),
      amenities: details.amenities
        .flatMap((group) => group.amenities)
        .filter((amenity) => amenity.available)
        .map((amenity) => amenity.title),
      houseRules: details.houseRules,
      // The listing-details response (AirbnbPdpSections/the sections this client reads) carries no
      // price field anywhere - left undefined rather than fabricated, as the domain type allows.
      price: undefined,
      rating: details.rating,
      images: details.images.map((image) => image.baseUrl),
      // No reliable availability signal in the sections this client reads - left undefined rather
      // than guessing `isAvailable: true`.
      availability: undefined,
    };
  }

  private normalizeHost(host: AirbnbHost | undefined): NormalizedListingDetails["host"] {
    if (!host) {
      // `host` is required on the domain type; MEET_YOUR_HOST section is occasionally absent
      // (e.g. co-hosted or hidden-host listings) - fall back to an explicit "unknown" placeholder
      // rather than fabricating a plausible-looking name.
      return { name: "Unknown", isSuperhost: false };
    }
    return {
      name: host.name,
      isSuperhost: host.isSuperhost,
      yearsHosting: host.timeAsHost?.years,
    };
  }

  /**
   * `overviewTitle` looks like "Entire rental unit in Paris, France" - everything before " in " is
   * the closest thing to a property-type string this response exposes. Best-effort: falls back to
   * the full title when the " in " separator isn't found.
   */
  private propertyTypeFromOverviewTitle(overviewTitle: string | undefined): string {
    if (!overviewTitle) return "";
    const [propertyType] = overviewTitle.split(" in ");
    return propertyType ?? overviewTitle;
  }

  /**
   * Best-effort keyword match against `overviewTitle` (e.g. "Entire rental unit in Paris, France")
   * to bucket into the domain's coarse roomType enum. Falls back to "entire_home" - documented as
   * an explicit placeholder, not a verified value - when no keyword matches (overviewTitle absent
   * or unrecognized).
   */
  private roomTypeFromOverviewTitle(
    overviewTitle: string | undefined,
  ): "entire_home" | "private_room" | "shared_room" | "hotel_room" {
    const lower = overviewTitle?.toLowerCase() ?? "";
    if (lower.includes("shared room")) return "shared_room";
    if (lower.includes("private room")) return "private_room";
    if (lower.includes("hotel")) return "hotel_room";
    return "entire_home";
  }

  /** Best-effort: the text after " in " in overviewTitle is usually the listing's location. */
  private locationFromOverviewTitle(overviewTitle: string | undefined): string | undefined {
    if (!overviewTitle) return undefined;
    const separatorIndex = overviewTitle.indexOf(" in ");
    if (separatorIndex === -1) return undefined;
    return overviewTitle.slice(separatorIndex + 4);
  }
}
