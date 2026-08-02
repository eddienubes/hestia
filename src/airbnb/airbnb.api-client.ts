import type { AirbnbApiKeyResolver } from "./airbnb.api-key-resolver.ts";
import { AirbnbApiError, AirbnbListingNotFoundError, AirbnbTimeoutError } from "./airbnb.errors.ts";
import {
  buildRawParam,
  encodeGlobalId,
  HOTEL_ROOM_TAG,
  propertyTypeToRoomTypeWireValue,
  tripLengthToWireValue,
  type AirbnbRawParam,
} from "./airbnb.utils.ts";

const DEFAULT_TIMEOUT_MS = 15_000;
const GRAPHQL_PLATFORM_CLIENT = "minimalist-niobe";

/**
 * Persisted-query sha256 hashes, captured live against airbnb.com on 2026-08-02 by driving a real
 * browser (search + a listing page) and reading the resulting `/api/v3/<OperationName>/<hash>`
 * request URLs. Airbnb regenerates these on frontend deploys without notice - if requests start
 * failing with 400/404 "PersistedQueryNotFound"-style errors, re-capture fresh hashes the same way
 * (browser network tab, filter for the operation name) and update the constants below.
 */
const STAYS_SEARCH_PERSISTED_HASH =
  "93cd7e1e49433311b8bbab7e564802de0cdaad4c211ff24d315b9d2d3f409f93";
const STAYS_PDP_SECTIONS_PERSISTED_HASH =
  "5de108ecaf67aa0bf813b60fd7e10dd45df3a413384ec2b4d09ad5ecc305a209";

/**
 * Active A/B-test bucket names Airbnb's own web client sent as `treatmentFlags` on 2026-08-02.
 * These appear to only affect server-side feature-flag bucketing/logging, not response shape, so a
 * stale list is expected to keep working; the persisted-query hash above is the fragile part. Kept
 * as a literal live capture rather than an empty array purely to mirror real traffic as closely as
 * possible.
 */
const STAYS_SEARCH_TREATMENT_FLAGS = [
  "feed_map_decouple_m11_treatment",
  "recommended_amenities_2024_treatment_b",
  "filter_redesign_2024_treatment",
  "filter_reordering_2024_roomtype_treatment",
  "p2_category_bar_removal_treatment",
  "selected_filters_2024_treatment",
  "recommended_filters_2024_treatment_b",
  "m13_search_input_phase2_treatment",
  "m13_search_input_services_enabled",
  "m13_2025_experiences_p2_treatment",
  "homes_p25_refresh_2025_treatment",
];

/**
 * The StaysPdpSections persisted query exposes dozens of optional GraphQL fragments behind
 * `includeGp<Name>Fragment` / `includePdpMigration<Name>Fragment` boolean variables (one pair per
 * PDP section, reflecting an in-flight "Gp" vs "PdpMigration" internal rename/rollout). Live
 * testing on 2026-08-02 found that this listing's sections only return real field data when the
 * `includeGp*` variant is requested (`includePdpMigration*` requested but not resolved by the
 * server for this listing, yielding bodies with only `__typename`). ALL of these boolean variables
 * must be present with the exact names below or the persisted query rejects the request with a
 * GraphQL "ValidationError" - so this is captured as a full literal rather than a partial object.
 */
const PDP_SECTIONS_INCLUDE_FLAGS = {
  includePdpMigrationAccessibilityFeaturesModalFragment: false,
  includeGpAccessibilityFeaturesFragment: true,
  includePdpMigrationAccessibilityFeaturesPreviewCarouselFragment: false,
  includePdpMigrationLuxeServicesFragment: false,
  includeGpLuxeServicesFragment: true,
  includeGpAdminBannerFragment: true,
  includePdpMigrationBookItNavFragment: false,
  includeGpBookItFragment: true,
  includePdpMigrationAmenitiesFragment: false,
  includeGpAmenitiesFragment: true,
  includeGpCancellationPolicyPickerModalFragment: true,
  includePdpMigrationAvailabilityCalendarInlineFragment: false,
  includeGpAvailabilityCalendarInlineFragment: true,
  includePdpMigrationAvailabilityCalendarFragment: false,
  includeGpAvailabilityCalendarFragment: true,
  includePdpMigrationDescriptionFragment: false,
  includeGpDescriptionFragment: true,
  includePdpMigrationHeroFragment: false,
  includeGpHeroFragment: true,
  includePdpMigrationHighlightsCompactFragment: false,
  includeGpHighlightsCompactFragment: true,
  includePdpMigrationHighlightsFragment: false,
  includeGpHighlightsFragment: true,
  includePdpMigrationLocationPdpFragment: false,
  includeGpLocationPdpFragment: true,
  includePdpMigrationMeetYourHostFragment: false,
  includeGpMeetYourHostFragment: true,
  includePdpMigrationMessageBannerFragment: false,
  includeGpMessageBannerFragment: true,
  includePdpMigrationNavFragment: false,
  includeGpNavFragment: true,
  includePdpMigrationNavMobileFragment: false,
  includeGpNavMobileFragment: true,
  includePdpMigrationBookItFloatingFooterFragment: false,
  includePdpMigrationBookItSidebarFragment: false,
  includePdpMigrationBookItCalendarSheetFragment: false,
  includePdpMigrationBookItNonExperiencedGuestFragment: false,
  includeGpBookItNonExperiencedGuestFragment: true,
  includePdpMigrationBathroomFragment: false,
  includeGpBathroomFragment: true,
  includePdpMigrationOverviewV2Fragment: false,
  includeGpOverviewV2Fragment: true,
  includePdpMigrationPropertyAvailableRoomsFragment: false,
  includeGpPropertyAvailableRoomsFragment: true,
  includePdpMigrationReviewsHighlightBannerFragment: false,
  includeGpReviewsHighlightBannerFragment: true,
  includePdpMigrationHostOverviewDefaultFragment: false,
  includeGpHostOverviewDefaultFragment: true,
  includePdpMigrationNonExperiencedGuestLearnMoreModalFragment: false,
  includeGpNonExperiencedGuestLearnMoreModalFragment: true,
  includePdpMigrationReportToAirbnbFragment: false,
  includeGpReportToAirbnbFragment: true,
  includePdpMigrationReviewsFragment: false,
  includeGpReviewsFragment: true,
  includePdpMigrationReviewsEmptyFragment: false,
  includeGpReviewsEmptyFragment: true,
  includePdpMigrationSeoLinksFragment: false,
  includeGpSeoLinksFragment: true,
  includePdpMigrationSleepingArrangementFragment: false,
  includeGpSleepingArrangementFragment: true,
  includePdpMigrationSleepingArrangementImagesFragment: false,
  includeGpSleepingArrangementImagesFragment: true,
  includePdpMigrationTitleFragment: false,
  includeGpTitleFragment: true,
  includeGpUgcTranslationFragment: true,
  includePdpMigrationPoliciesFragment: false,
  includeGpPoliciesFragment: true,
  includePdpMigrationMarqueeBookItFloatingFooterFragment: false,
  includeGpMarqueeBookItFloatingFooterFragment: true,
  includePdpMigrationMarqueeBookItNavFragment: false,
  includeGpMarqueeBookItNavFragment: true,
  includePdpMigrationMarqueeBookItSidebarFragment: false,
  includeGpMarqueeBookItSidebarFragment: true,
  includePdpMigrationOnlyOnBookItFragment: false,
  includePdpMigrationOnlyOnBookItNavFragment: false,
  includePdpMigrationPdpEducationFragment: false,
};

/** The PDP sections we actually read fields from - passed as `pdpSectionsRequest.sectionIds`. */
const PDP_CONTENT_SECTION_IDS = [
  "TITLE_DEFAULT",
  "HERO_DEFAULT",
  "OVERVIEW_DEFAULT_V2",
  "DESCRIPTION_DEFAULT",
  "AMENITIES_DEFAULT",
  "HIGHLIGHTS_DEFAULT",
  "MEET_YOUR_HOST",
  "LOCATION_DEFAULT",
  "POLICIES_DEFAULT",
  "REVIEWS_DEFAULT",
  "SLEEPING_ARRANGEMENT_WITH_IMAGES",
];

/** Narrowed down to what this file actually calls, matching the pattern in airbnb.api-key-resolver.ts. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface AirbnbApiClientOptions {
  /** Overrides the global `fetch` used for all requests - mainly for tests. */
  fetchImpl?: FetchLike;
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Search: upstream request/response shapes
// ---------------------------------------------------------------------------

/**
 * Upstream-shaped search request params. Close to (but distinct from) the domain's
 * `NormalizedSearchParams` - amenities are already-resolved numeric ids (see airbnb.amenities.ts)
 * rather than human-readable names, since resolving names -> ids is the provider layer's job, not
 * this client's.
 */
export interface AirbnbSearchParams {
  location: string;
  placeId?: string;
  currency: string;
  minPrice?: number;
  maxPrice?: number;
  propertyType?: "entire_home" | "private_room" | "shared_room" | "hotel_room";
  amenityIds?: number[];
  limit: number;
  cursor?: string;
  dateMode: "exact" | "flexible";
  checkin?: string;
  checkout?: string;
  flexibleTripLength?: "weekend" | "week" | "month";
  flexibleMonths?: string[];
}

export interface AirbnbImage {
  id: string;
  baseUrl: string;
}

export interface AirbnbSearchResultBadge {
  text: string;
}

/**
 * Airbnb sends two different price-line shapes depending on the search mode: a
 * `QualifiedDisplayPriceLine` (`price` + `qualifier: "total"`) for exact-date nightly searches, and
 * a `DiscountedDisplayPriceLine` (`discountedPrice`/`originalPrice` + `qualifier: "monthly"`) for
 * flexible/monthly searches. Both confirmed live on 2026-08-02. Modeled loosely here since only the
 * normalizer needs to pick whichever fields are present.
 */
export interface AirbnbSearchResultPriceLine {
  price?: string;
  discountedPrice?: string;
  originalPrice?: string;
  qualifier?: string | null;
}

export interface AirbnbSearchResult {
  /** Category + city, e.g. "Apartment in Paris" - NOT the listing's own name. */
  title: string;
  /** The listing's actual name/headline, e.g. "Upper-class luxury studio rue des Capucines". */
  subtitle: string;
  /**
   * e.g. "4.94 out of 5 average rating,  17 reviews" - the only place search results expose both
   * the numeric rating and review count together; see `parseAvgRatingA11yLabel`. Absent/null when
   * the listing has no reviews yet.
   */
  avgRatingA11yLabel?: string | null;
  badges: AirbnbSearchResultBadge[];
  contextualPictures: AirbnbImage[];
  structuredDisplayPrice?: { primaryLine?: AirbnbSearchResultPriceLine | null } | null;
  demandStayListing?: {
    /** base64("DemandStayListing:<numericListingId>") - decode to get the plain listing id. */
    id: string;
    location?: { coordinate?: { latitude: number; longitude: number } | null } | null;
  } | null;
}

export interface AirbnbSearchResponse {
  data?: {
    presentation?: {
      staysSearch?: {
        results?: {
          searchResults: AirbnbSearchResult[];
          paginationInfo?: { pageCursors?: string[] | null } | null;
        } | null;
      } | null;
    } | null;
  };
  errors?: Array<{ message: string }>;
}

// ---------------------------------------------------------------------------
// Listing details: upstream request/response shapes
// ---------------------------------------------------------------------------

export interface AirbnbListingDetailsParams {
  checkin?: string;
  checkout?: string;
  adults: number;
  children?: number;
  infants?: number;
  pets?: number;
  currency: string;
}

interface AirbnbPdpSectionContainer {
  sectionId: string;
  sectionContentStatus: string;
  section: Record<string, unknown> | null;
}

interface AirbnbPdpSectionDataContainer {
  sectionId: string;
  sectionData: Record<string, unknown> | null;
}

interface AirbnbListingDetailsErrorExtensions {
  errorType?: string;
}

/** The `stayProductDetailPage.sections` payload - all the section data a PDP response carries. */
export interface AirbnbPdpSections {
  sections: AirbnbPdpSectionContainer[];
  sbuiData?: {
    sectionConfiguration?: {
      root?: { sections?: AirbnbPdpSectionDataContainer[] } | null;
    } | null;
  } | null;
}

export interface AirbnbListingDetailsResponse {
  data?: {
    presentation?: {
      stayProductDetailPage?: {
        sections?: AirbnbPdpSections | null;
      } | null;
    } | null;
  };
  errors?: Array<{ message: string; extensions?: AirbnbListingDetailsErrorExtensions }>;
}

export interface AirbnbAmenity {
  id: string;
  available: boolean;
  title: string;
  icon?: string | null;
}

export interface AirbnbAmenitiesGroup {
  title: string;
  amenities: AirbnbAmenity[];
}

export interface AirbnbHighlight {
  title: string;
  subtitle?: string | null;
}

export interface AirbnbHost {
  name: string;
  isSuperhost: boolean;
  isVerified?: boolean;
  ratingAverage?: number | null;
  ratingCount?: number | null;
  timeAsHost?: { years: number; months: number } | null;
  profilePictureUrl?: string | null;
}

/**
 * Listing details assembled from the several PDP sections returned by a single StaysPdpSections
 * call (see `AirbnbApiClient.getListingDetails`). This is deliberately a flattened, purpose-built
 * shape rather than the raw sparse `sections[]`/`sbuiData` array Airbnb returns, since that raw
 * shape is a heterogeneous list keyed by `sectionId` with no natural static type - picking the
 * fields we need out of it is this client's job, leaving the *normalizer* (a later chunk) with a
 * plain object to map into `NormalizedListingDetails`.
 */
export interface AirbnbListingDetails {
  id: string;
  title: string;
  descriptionHtml?: string;
  images: AirbnbImage[];
  /** e.g. "Entire rental unit in Paris, France" - combines property + room type + location. */
  overviewTitle?: string;
  /** e.g. ["2 guests", "1 bedroom", "1 bed", "1 bath"] - see `parseOverviewCount` to extract counts. */
  overviewItems: string[];
  highlights: AirbnbHighlight[];
  amenities: AirbnbAmenitiesGroup[];
  host?: AirbnbHost;
  location?: { lat: number; lng: number; label?: string };
  houseRules: string[];
  safetyAndProperty: string[];
  rating: { value: number | null; reviewCount: number };
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class AirbnbApiClient {
  private readonly keyResolver: AirbnbApiKeyResolver;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(keyResolver: AirbnbApiKeyResolver, options: AirbnbApiClientOptions = {}) {
    this.keyResolver = keyResolver;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async search(params: AirbnbSearchParams): Promise<AirbnbSearchResponse> {
    const url = `https://www.airbnb.com/api/v3/StaysSearch/${STAYS_SEARCH_PERSISTED_HASH}?operationName=StaysSearch&locale=en&currency=${encodeURIComponent(params.currency)}`;
    const body = this.buildSearchBody(params);
    const json = await this.request(url, body, "StaysSearch");
    return json as AirbnbSearchResponse;
  }

  async getListingDetails(
    id: string,
    params: AirbnbListingDetailsParams,
  ): Promise<AirbnbListingDetails> {
    const url = `https://www.airbnb.com/api/v3/StaysPdpSections/${STAYS_PDP_SECTIONS_PERSISTED_HASH}?operationName=StaysPdpSections&locale=en&currency=${encodeURIComponent(params.currency)}`;
    const body = this.buildListingDetailsBody(id, params);
    const json = (await this.request(
      url,
      body,
      "StaysPdpSections",
    )) as AirbnbListingDetailsResponse;

    const sections = json.data?.presentation?.stayProductDetailPage?.sections;
    const permissionDenied = json.errors?.some(
      (error) => error.extensions?.errorType === "PERMISSION_DENIED",
    );
    // Live-verified on 2026-08-02: a nonexistent/inaccessible listing id returns HTTP 200 with an
    // empty `sections.sections` array and a top-level GraphQL "PERMISSION_DENIED" error, rather
    // than a 404. Treat either signal as not-found.
    if (!sections || sections.sections.length === 0 || permissionDenied) {
      throw new AirbnbListingNotFoundError(id);
    }

    return this.assembleListingDetails(id, sections);
  }

  private async request(url: string, body: unknown, operationName: string): Promise<unknown> {
    const attempt = async (apiKey: string): Promise<Response> => {
      try {
        return await this.fetchImpl(url, {
          method: "POST",
          headers: this.buildHeaders(apiKey),
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (error) {
        if (
          error instanceof Error &&
          (error.name === "TimeoutError" || error.name === "AbortError")
        ) {
          throw new AirbnbTimeoutError(
            `${operationName} request timed out after ${this.timeoutMs}ms.`,
          );
        }
        throw error;
      }
    };

    let response = await attempt(this.keyResolver.getKey());

    if (response.status === 401 || response.status === 403) {
      const refreshedKey = await this.keyResolver.refresh();
      response = await attempt(refreshedKey);
      if (response.status === 401 || response.status === 403) {
        throw new AirbnbApiError(
          `${operationName} returned HTTP ${response.status} even after refreshing the API key.`,
        );
      }
    }

    if (!response.ok) {
      throw new AirbnbApiError(`${operationName} returned HTTP ${response.status}.`);
    }

    try {
      return await response.json();
    } catch {
      throw new AirbnbApiError(`${operationName} returned malformed JSON.`);
    }
  }

  private buildHeaders(apiKey: string): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "X-Airbnb-Api-Key": apiKey,
      "X-Airbnb-GraphQL-Platform": "web",
      "X-Airbnb-GraphQL-Platform-Client": GRAPHQL_PLATFORM_CLIENT,
      "X-CSRF-Token": "",
      "X-CSRF-Without-Token": "1",
    };
  }

  private buildSearchBody(params: AirbnbSearchParams): unknown {
    const rawParams: AirbnbRawParam[] = [
      buildRawParam("cdnCacheSafe", "false"),
      buildRawParam("channel", "EXPLORE"),
      buildRawParam("priceFilterInputType", "2"),
      buildRawParam("query", params.location),
      buildRawParam("refinementPaths", "/homes"),
      buildRawParam("screenSize", "large"),
      buildRawParam("searchMode", "regular_search"),
      buildRawParam("tabId", "home_tab"),
      buildRawParam("version", "1.8.8"),
    ];

    if (params.placeId) rawParams.push(buildRawParam("placeId", params.placeId));
    if (params.minPrice !== undefined) {
      rawParams.push(buildRawParam("priceMin", String(params.minPrice)));
    }
    if (params.maxPrice !== undefined) {
      rawParams.push(buildRawParam("priceMax", String(params.maxPrice)));
    }
    if (params.amenityIds?.length) {
      rawParams.push(buildRawParam("amenities", ...params.amenityIds.map(String)));
    }

    if (params.propertyType === "hotel_room") {
      rawParams.push(buildRawParam("kgAndTags", HOTEL_ROOM_TAG));
    } else if (params.propertyType) {
      rawParams.push(
        buildRawParam("roomTypes", propertyTypeToRoomTypeWireValue(params.propertyType)),
      );
    }

    if (params.dateMode === "exact") {
      if (params.checkin) rawParams.push(buildRawParam("checkin", params.checkin));
      if (params.checkout) rawParams.push(buildRawParam("checkout", params.checkout));
    } else {
      rawParams.push(buildRawParam("datePickerType", "flexible_dates"));
      if (params.flexibleTripLength) {
        rawParams.push(
          buildRawParam("flexibleTripLengths", tripLengthToWireValue(params.flexibleTripLength)),
        );
      }
      // Live-verified for "weekend"/"week": selecting target months sets `flexibleTripDates`.
      // Not separately re-verified for "month" (the calendar UI drives that case through
      // monthlyStartDate/monthlyEndDate instead) - but Q3 in the Phase 1 write-up confirmed those
      // monthly-specific params aren't required for correct results, so sending
      // `flexibleTripDates` uniformly across all three trip lengths is expected to be harmless.
      if (params.flexibleMonths?.length) {
        rawParams.push(buildRawParam("flexibleTripDates", ...params.flexibleMonths));
      }
    }

    const sharedRequestFields = {
      metadataOnly: false,
      requestedPageType: "STAYS_SEARCH",
      searchType: "unknown",
      source: "structured_search_input_header",
      treatmentFlags: STAYS_SEARCH_TREATMENT_FLAGS,
    };

    const itemsPerGridParam = buildRawParam("itemsPerGrid", String(params.limit));

    return {
      operationName: "StaysSearch",
      variables: {
        staysSearchRequest: {
          ...sharedRequestFields,
          maxMapItems: 9999,
          rawParams: [...rawParams, itemsPerGridParam],
          ...(params.cursor ? { cursor: params.cursor } : {}),
        },
        staysMapSearchRequestV2: {
          ...sharedRequestFields,
          rawParams,
          ...(params.cursor ? { cursor: params.cursor } : {}),
        },
        isLeanTreatment: false,
        aiSearchEnabled: false,
      },
      extensions: { persistedQuery: { version: 1, sha256Hash: STAYS_SEARCH_PERSISTED_HASH } },
    };
  }

  private buildListingDetailsBody(id: string, params: AirbnbListingDetailsParams): unknown {
    return {
      operationName: "StaysPdpSections",
      variables: {
        id: encodeGlobalId("StayListing", id),
        demandStayListingId: encodeGlobalId("DemandStayListing", id),
        pdpSectionsRequest: {
          adults: String(params.adults),
          children: params.children ? String(params.children) : null,
          infants: params.infants ? String(params.infants) : null,
          pets: params.pets ?? 0,
          layouts: ["SIDEBAR", "SINGLE_COLUMN"],
          sectionIds: PDP_CONTENT_SECTION_IDS,
          checkIn: params.checkin ?? null,
          checkOut: params.checkout ?? null,
        },
        ...PDP_SECTIONS_INCLUDE_FLAGS,
      },
      extensions: {
        persistedQuery: { version: 1, sha256Hash: STAYS_PDP_SECTIONS_PERSISTED_HASH },
      },
    };
  }

  private assembleListingDetails(id: string, sections: AirbnbPdpSections): AirbnbListingDetails {
    const bySectionId = new Map(sections.sections.map((s) => [s.sectionId, s.section]));
    const sbuiSections = sections.sbuiData?.sectionConfiguration?.root?.sections ?? [];
    const sbuiBySectionId = new Map(sbuiSections.map((s) => [s.sectionId, s.sectionData]));

    const title = (bySectionId.get("TITLE_DEFAULT")?.title as string | undefined) ?? "";
    const description = bySectionId.get("DESCRIPTION_DEFAULT");
    const htmlDescription = description?.htmlDescription as { htmlText?: string } | undefined;

    const hero = bySectionId.get("HERO_DEFAULT");
    const images = (hero?.previewImages as AirbnbImage[] | undefined) ?? [];

    const overview = sbuiBySectionId.get("OVERVIEW_DEFAULT_V2");
    const overviewTitle = overview?.title as string | undefined;
    const overviewItems = ((overview?.overviewItems as Array<{ title?: string }> | undefined) ?? [])
      .map((item) => item.title)
      .filter((t): t is string => Boolean(t));

    const highlightsSection = bySectionId.get("HIGHLIGHTS_DEFAULT");
    const highlights =
      (highlightsSection?.highlights as
        | Array<{ title: string; subtitle?: string | null }>
        | undefined) ?? [];

    const amenitiesSection = bySectionId.get("AMENITIES_DEFAULT");
    const amenities =
      (amenitiesSection?.seeAllAmenitiesGroups as AirbnbAmenitiesGroup[] | undefined) ??
      (amenitiesSection?.previewAmenitiesGroups as AirbnbAmenitiesGroup[] | undefined) ??
      [];

    const hostCard = bySectionId.get("MEET_YOUR_HOST")?.cardData as
      | {
          name: string;
          isSuperhost: boolean;
          isVerified?: boolean;
          ratingAverage?: number | null;
          ratingCount?: number | null;
          timeAsHost?: { years: number; months: number } | null;
          profilePictureUrl?: string | null;
        }
      | undefined;

    const locationSection = bySectionId.get("LOCATION_DEFAULT") as
      | { lat?: number; lng?: number; subtitle?: string }
      | undefined;

    const policies = bySectionId.get("POLICIES_DEFAULT");
    const houseRules = ((policies?.houseRules as Array<{ title?: string }> | undefined) ?? [])
      .map((r) => r.title)
      .filter((t): t is string => Boolean(t));
    const safetyAndProperty = (
      (policies?.previewSafetyAndProperties as Array<{ title?: string }> | undefined) ?? []
    )
      .map((r) => r.title)
      .filter((t): t is string => Boolean(t));

    const reviews = bySectionId.get("REVIEWS_DEFAULT") as
      | { overallCount?: number; overallRating?: number }
      | undefined;

    return {
      id,
      title,
      descriptionHtml: htmlDescription?.htmlText,
      images,
      overviewTitle,
      overviewItems,
      highlights,
      amenities,
      host: hostCard
        ? {
            name: hostCard.name,
            isSuperhost: hostCard.isSuperhost,
            isVerified: hostCard.isVerified,
            ratingAverage: hostCard.ratingAverage,
            ratingCount: hostCard.ratingCount,
            timeAsHost: hostCard.timeAsHost,
            profilePictureUrl: hostCard.profilePictureUrl,
          }
        : undefined,
      location:
        locationSection?.lat !== undefined && locationSection?.lng !== undefined
          ? { lat: locationSection.lat, lng: locationSection.lng, label: locationSection.subtitle }
          : undefined,
      houseRules,
      safetyAndProperty,
      rating: {
        value: reviews?.overallRating ?? null,
        reviewCount: reviews?.overallCount ?? 0,
      },
    };
  }
}
