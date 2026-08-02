import { describe, expect, it } from "bun:test";
import type {
  NormalizedListingDetailsParams,
  NormalizedSearchParams,
} from "../accommodation-search.provider.ts";
import type {
  AirbnbApiClient,
  AirbnbListingDetails,
  AirbnbListingDetailsParams,
  AirbnbSearchParams,
  AirbnbSearchResponse,
  AirbnbSearchResult,
} from "./airbnb.api-client.ts";
import { AirbnbProvider } from "./airbnb.provider.ts";
import { encodeGlobalId } from "./airbnb.utils.ts";

/** Builds an AirbnbProvider wired to a fake client whose search()/getListingDetails() are stubbed. */
const createProvider = (
  search: (params: AirbnbSearchParams) => Promise<AirbnbSearchResponse>,
  getListingDetails?: (
    id: string,
    params: AirbnbListingDetailsParams,
  ) => Promise<AirbnbListingDetails>,
): AirbnbProvider => {
  const client = {
    search,
    getListingDetails,
  } as unknown as AirbnbApiClient;
  return new AirbnbProvider(client);
};

const baseSearchParams: NormalizedSearchParams = {
  location: "Paris, France",
  placeId: "ChIJD7fiBh9u5kcRYJSMaMOCCwQ",
  adults: 2,
  children: 1,
  infants: 0,
  pets: 0,
  currency: "USD",
  limit: 18,
  dateMode: "exact",
  checkin: "2026-09-10",
  checkout: "2026-09-15",
};

const emptySearchResponse: AirbnbSearchResponse = {
  data: {
    presentation: {
      staysSearch: {
        results: { searchResults: [], paginationInfo: { pageCursors: [] } },
      },
    },
  },
};

// Trimmed/adapted from the real search-result shape captured in airbnb.api-client.spec.ts.
const searchResultFixture: AirbnbSearchResult = {
  title: "Apartment in Paris",
  subtitle: "Upper-class luxury studio rue des Capucines",
  avgRatingA11yLabel: "4.94 out of 5 average rating,  17 reviews",
  badges: [{ text: "Superhost" }],
  contextualPictures: [
    {
      id: "1661141524",
      baseUrl:
        "https://a0.muscache.com/im/pictures/miso/Hosting-3367761/original/0ef47b10-d337-4e89-8838-a1ea97bd604c.jpeg",
    },
  ],
  structuredDisplayPrice: { primaryLine: { price: "$120", qualifier: "total" } },
  demandStayListing: {
    id: encodeGlobalId("DemandStayListing", "3367761"),
    location: { coordinate: { latitude: 48.8701, longitude: 2.32962 } },
  },
};

describe(AirbnbProvider.name, () => {
  describe(AirbnbProvider.prototype.search.name, () => {
    it("maps exact-mode NormalizedSearchParams into AirbnbSearchParams", async () => {
      let captured: AirbnbSearchParams | undefined;
      const provider = createProvider(async (params) => {
        captured = params;
        return emptySearchResponse;
      });

      await provider.search(baseSearchParams);

      expect(captured).toEqual({
        location: "Paris, France",
        placeId: "ChIJD7fiBh9u5kcRYJSMaMOCCwQ",
        currency: "USD",
        minPrice: undefined,
        maxPrice: undefined,
        propertyType: undefined,
        amenityIds: undefined,
        limit: 18,
        cursor: undefined,
        dateMode: "exact",
        checkin: "2026-09-10",
        checkout: "2026-09-15",
        flexibleTripLength: undefined,
        flexibleMonths: undefined,
      });
    });

    it("maps flexible-mode NormalizedSearchParams into AirbnbSearchParams", async () => {
      let captured: AirbnbSearchParams | undefined;
      const provider = createProvider(async (params) => {
        captured = params;
        return emptySearchResponse;
      });

      const flexibleParams: NormalizedSearchParams = {
        ...baseSearchParams,
        dateMode: "flexible",
        checkin: undefined,
        checkout: undefined,
        flexibleTripLength: "weekend",
        flexibleMonths: ["october"],
      };
      await provider.search(flexibleParams);

      expect(captured?.dateMode).toBe("flexible");
      expect(captured?.flexibleTripLength).toBe("weekend");
      expect(captured?.flexibleMonths).toEqual(["october"]);
      expect(captured?.checkin).toBeUndefined();
      expect(captured?.checkout).toBeUndefined();
    });

    it("resolves human-readable amenity names to numeric ids before calling the client", async () => {
      let captured: AirbnbSearchParams | undefined;
      const provider = createProvider(async (params) => {
        captured = params;
        return emptySearchResponse;
      });

      await provider.search({ ...baseSearchParams, amenities: ["wifi", "pool"] });

      expect(captured?.amenityIds).toEqual([4, 7]);
    });

    it("normalizes a realistic search response into NormalizedListingSummary[] + nextCursor", async () => {
      const provider = createProvider(async () => ({
        data: {
          presentation: {
            staysSearch: {
              results: {
                searchResults: [searchResultFixture],
                paginationInfo: { pageCursors: ["next-cursor-token"] },
              },
            },
          },
        },
      }));

      const result = await provider.search(baseSearchParams);

      expect(result.nextCursor).toBe("next-cursor-token");
      expect(result.listings).toHaveLength(1);
      expect(result.listings[0]).toEqual({
        id: "3367761",
        listingUrl: "https://www.airbnb.com/rooms/3367761",
        name: "Upper-class luxury studio rue des Capucines",
        propertyType: "Apartment in Paris",
        roomType: "entire_home",
        locationLabel: "Paris, France",
        price: { amount: 120, currency: "USD", period: "total" },
        rating: { value: 4.94, reviewCount: 17 },
        thumbnailUrl:
          "https://a0.muscache.com/im/pictures/miso/Hosting-3367761/original/0ef47b10-d337-4e89-8838-a1ea97bd604c.jpeg",
        guests: 3,
        isSuperhost: true,
      });
    });

    it("uses the requested propertyType filter as the roomType when the search was filtered by it", async () => {
      const provider = createProvider(async () => ({
        data: {
          presentation: {
            staysSearch: {
              results: { searchResults: [searchResultFixture], paginationInfo: {} },
            },
          },
        },
      }));

      const result = await provider.search({ ...baseSearchParams, propertyType: "private_room" });

      expect(result.listings[0]?.roomType).toBe("private_room");
    });
  });

  describe(AirbnbProvider.prototype.getListingDetails.name, () => {
    const detailsParams: NormalizedListingDetailsParams = {
      listingId: "3367761",
      checkin: "2026-09-10",
      checkout: "2026-09-15",
      adults: 2,
      children: 1,
      infants: 0,
      pets: 0,
      currency: "USD",
    };

    // Trimmed/adapted from the real AirbnbListingDetails shape assembled in airbnb.api-client.spec.ts.
    const listingDetailsFixture: AirbnbListingDetails = {
      id: "3367761",
      title: "Upper-class luxury studio rue des Capucines",
      descriptionHtml: "<p>Located next to the <b>prestigious</b> place Vendome.</p>",
      images: [
        {
          id: "1661141524",
          baseUrl:
            "https://a0.muscache.com/im/pictures/miso/Hosting-3367761/original/0ef47b10-d337-4e89-8838-a1ea97bd604c.jpeg",
        },
      ],
      overviewTitle: "Entire rental unit in Paris, France",
      overviewItems: ["2 guests", "1 bedroom", "1 bed", "1 bath"],
      highlights: [],
      amenities: [
        {
          title: "Bathroom",
          amenities: [
            { id: "a1", available: true, title: "Hair dryer" },
            { id: "a2", available: false, title: "Bathtub" },
          ],
        },
        {
          title: "Kitchen",
          amenities: [{ id: "a3", available: true, title: "Refrigerator" }],
        },
      ],
      host: {
        name: "Roumen",
        isSuperhost: true,
        isVerified: true,
        ratingAverage: 4.91,
        ratingCount: 161,
        timeAsHost: { years: 9, months: 0 },
        profilePictureUrl:
          "https://a0.muscache.com/im/pictures/user/User-16991929/original/168e7ef2-d9d8-491c-9479-c775875db3e0.jpeg",
      },
      location: { lat: 48.8701, lng: 2.32962, label: "Paris, Île-de-France, France" },
      houseRules: ["Check-in: 4:00 PM - 9:00 PM", "Checkout before 12:00 PM"],
      safetyAndProperty: ["Carbon monoxide alarm", "Smoke alarm"],
      rating: { value: 4.94, reviewCount: 17 },
    };

    it("passes params through to the client", async () => {
      let capturedId: string | undefined;
      let capturedParams: AirbnbListingDetailsParams | undefined;
      const provider = createProvider(
        async () => emptySearchResponse,
        async (id, params) => {
          capturedId = id;
          capturedParams = params;
          return listingDetailsFixture;
        },
      );

      await provider.getListingDetails(detailsParams);

      expect(capturedId).toBe("3367761");
      expect(capturedParams).toEqual({
        checkin: "2026-09-10",
        checkout: "2026-09-15",
        adults: 2,
        children: 1,
        infants: 0,
        pets: 0,
        currency: "USD",
      });
    });

    it("normalizes a realistic listing-details response into NormalizedListingDetails", async () => {
      const provider = createProvider(
        async () => emptySearchResponse,
        async () => listingDetailsFixture,
      );

      const result = await provider.getListingDetails(detailsParams);

      expect(result).toEqual({
        id: "3367761",
        listingUrl: "https://www.airbnb.com/rooms/3367761",
        name: "Upper-class luxury studio rue des Capucines",
        description: "Located next to the prestigious place Vendome.",
        propertyType: "Entire rental unit",
        roomType: "entire_home",
        host: { name: "Roumen", isSuperhost: true, yearsHosting: 9 },
        locationLabel: "Paris, Île-de-France, France",
        guests: 2,
        bedrooms: 1,
        beds: 1,
        baths: 1,
        // Only available:true amenities are flattened in, across all groups.
        amenities: ["Hair dryer", "Refrigerator"],
        houseRules: ["Check-in: 4:00 PM - 9:00 PM", "Checkout before 12:00 PM"],
        price: undefined,
        rating: { value: 4.94, reviewCount: 17 },
        images: [
          "https://a0.muscache.com/im/pictures/miso/Hosting-3367761/original/0ef47b10-d337-4e89-8838-a1ea97bd604c.jpeg",
        ],
        availability: undefined,
      });
    });

    it("falls back to a placeholder host when the host section is absent", async () => {
      const provider = createProvider(
        async () => emptySearchResponse,
        async () => ({ ...listingDetailsFixture, host: undefined }),
      );

      const result = await provider.getListingDetails(detailsParams);

      expect(result.host).toEqual({ name: "Unknown", isSuperhost: false });
    });
  });
});
