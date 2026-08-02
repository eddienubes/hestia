import { describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AirbnbApiClient,
  type AirbnbListingDetailsResponse,
  type AirbnbSearchParams,
  type AirbnbSearchResponse,
} from "./airbnb.api-client.ts";
import { AirbnbApiKeyResolver, type FetchLike } from "./airbnb.api-key-resolver.ts";
import { AirbnbApiError, AirbnbListingNotFoundError, AirbnbTimeoutError } from "./airbnb.errors.ts";

const HARDCODED_API_KEY = "d306zoyjsyarp7ifhu67rjxn52tv0t20";
const REFRESHED_API_KEY = "abcdef0123456789abcdef0123456789";

/** A resolver that never touches disk/network for getKey(), and only exercises refresh() when told to. */
const makeKeyResolver = (refreshFetchImpl?: FetchLike): AirbnbApiKeyResolver => {
  const cacheDir = mkdtempSync(join(tmpdir(), "hestia-api-client-"));
  return new AirbnbApiKeyResolver({
    cacheDir,
    fetchImpl:
      refreshFetchImpl ??
      (() => {
        throw new Error("refresh() should not have been called in this test");
      }),
  });
};

interface CapturedRequest {
  url: string;
  init: RequestInit;
  body: any;
}

/** A fake fetch that records every call and returns a scripted sequence of responses. */
const scriptedFetch = (
  responses: Array<Response | (() => Response)>,
): { fetchImpl: FetchLike; calls: CapturedRequest[] } => {
  const calls: CapturedRequest[] = [];
  let i = 0;
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init: init ?? {}, body: JSON.parse(String(init?.body ?? "{}")) });
    const next = responses[Math.min(i, responses.length - 1)]!;
    i += 1;
    return typeof next === "function" ? next() : next;
  };
  return { fetchImpl, calls };
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status });

const emptySearchResponse: AirbnbSearchResponse = {
  data: {
    presentation: {
      staysSearch: {
        results: {
          searchResults: [],
          paginationInfo: { pageCursors: [] },
        },
      },
    },
  },
};

const baseSearchParams: AirbnbSearchParams = {
  location: "Paris, France",
  placeId: "ChIJD7fiBh9u5kcRYJSMaMOCCwQ",
  currency: "USD",
  limit: 18,
  dateMode: "exact",
  checkin: "2026-09-10",
  checkout: "2026-09-15",
};

describe(AirbnbApiClient.name, () => {
  describe(AirbnbApiClient.prototype.search.name, () => {
    it("builds a correct exact-mode request (checkin/checkout rawParams, no flexible params)", async () => {
      const { fetchImpl, calls } = scriptedFetch([jsonResponse(emptySearchResponse)]);
      const client = new AirbnbApiClient(makeKeyResolver(), { fetchImpl });

      await client.search(baseSearchParams);

      expect(calls).toHaveLength(1);
      const call = calls[0]!;
      expect(call.url).toContain("/api/v3/StaysSearch/");
      expect(call.url).toContain("operationName=StaysSearch");
      expect(call.init.method).toBe("POST");
      expect((call.init.headers as Record<string, string>)["X-Airbnb-Api-Key"]).toBe(
        HARDCODED_API_KEY,
      );

      const rawParams = call.body.variables.staysSearchRequest.rawParams;
      const byName = Object.fromEntries(rawParams.map((p: any) => [p.filterName, p.filterValues]));
      expect(byName.checkin).toEqual(["2026-09-10"]);
      expect(byName.checkout).toEqual(["2026-09-15"]);
      expect(byName.query).toEqual(["Paris, France"]);
      expect(byName.placeId).toEqual(["ChIJD7fiBh9u5kcRYJSMaMOCCwQ"]);
      expect(byName.datePickerType).toBeUndefined();
      expect(byName.flexibleTripLengths).toBeUndefined();
      expect(byName.flexibleTripDates).toBeUndefined();
    });

    it("builds a correct flexible-mode request (datePickerType/flexibleTripLengths/flexibleTripDates, no checkin/checkout)", async () => {
      const { fetchImpl, calls } = scriptedFetch([jsonResponse(emptySearchResponse)]);
      const client = new AirbnbApiClient(makeKeyResolver(), { fetchImpl });

      const params: AirbnbSearchParams = {
        location: "Paris, France",
        currency: "USD",
        limit: 18,
        dateMode: "flexible",
        flexibleTripLength: "weekend",
        flexibleMonths: ["october"],
      };
      await client.search(params);

      const rawParams = calls[0]!.body.variables.staysSearchRequest.rawParams;
      const byName = Object.fromEntries(rawParams.map((p: any) => [p.filterName, p.filterValues]));
      expect(byName.datePickerType).toEqual(["flexible_dates"]);
      expect(byName.flexibleTripLengths).toEqual(["weekend_trip"]);
      expect(byName.flexibleTripDates).toEqual(["october"]);
      expect(byName.checkin).toBeUndefined();
      expect(byName.checkout).toBeUndefined();
      // No placeId was given - query-only search, live-confirmed to work.
      expect(byName.placeId).toBeUndefined();
    });

    it("omits itemsPerGrid/maxMapItems from the map request but includes them in the search request", async () => {
      const { fetchImpl, calls } = scriptedFetch([jsonResponse(emptySearchResponse)]);
      const client = new AirbnbApiClient(makeKeyResolver(), { fetchImpl });

      await client.search(baseSearchParams);

      const { staysSearchRequest, staysMapSearchRequestV2 } = calls[0]!.body.variables;
      expect(staysSearchRequest.maxMapItems).toBe(9999);
      const searchNames = staysSearchRequest.rawParams.map((p: any) => p.filterName);
      expect(searchNames).toContain("itemsPerGrid");
      const mapNames = staysMapSearchRequestV2.rawParams.map((p: any) => p.filterName);
      expect(mapNames).not.toContain("itemsPerGrid");
      expect(staysMapSearchRequestV2.maxMapItems).toBeUndefined();
    });

    it("maps hotel_room property type to a kgAndTags rawParam instead of roomTypes", async () => {
      const { fetchImpl, calls } = scriptedFetch([jsonResponse(emptySearchResponse)]);
      const client = new AirbnbApiClient(makeKeyResolver(), { fetchImpl });

      await client.search({ ...baseSearchParams, propertyType: "hotel_room" });

      const rawParams = calls[0]!.body.variables.staysSearchRequest.rawParams;
      const byName = Object.fromEntries(rawParams.map((p: any) => [p.filterName, p.filterValues]));
      expect(byName.kgAndTags).toEqual(["Tag:9613"]);
      expect(byName.roomTypes).toBeUndefined();
    });

    it("maps entire_home property type to a roomTypes rawParam", async () => {
      const { fetchImpl, calls } = scriptedFetch([jsonResponse(emptySearchResponse)]);
      const client = new AirbnbApiClient(makeKeyResolver(), { fetchImpl });

      await client.search({ ...baseSearchParams, propertyType: "entire_home" });

      const rawParams = calls[0]!.body.variables.staysSearchRequest.rawParams;
      const byName = Object.fromEntries(rawParams.map((p: any) => [p.filterName, p.filterValues]));
      expect(byName.roomTypes).toEqual(["Entire home/apt"]);
    });

    it("includes priceMin/priceMax rawParams when given", async () => {
      const { fetchImpl, calls } = scriptedFetch([jsonResponse(emptySearchResponse)]);
      const client = new AirbnbApiClient(makeKeyResolver(), { fetchImpl });

      await client.search({ ...baseSearchParams, minPrice: 100, maxPrice: 500 });

      const rawParams = calls[0]!.body.variables.staysSearchRequest.rawParams;
      const byName = Object.fromEntries(rawParams.map((p: any) => [p.filterName, p.filterValues]));
      expect(byName.priceMin).toEqual(["100"]);
      expect(byName.priceMax).toEqual(["500"]);
    });

    it("sends the pagination cursor as a top-level staysSearchRequest field, not a rawParam", async () => {
      const { fetchImpl, calls } = scriptedFetch([jsonResponse(emptySearchResponse)]);
      const client = new AirbnbApiClient(makeKeyResolver(), { fetchImpl });

      const cursor = "eyJzZWN0aW9uX29mZnNldCI6MCwiaXRlbXNfb2Zmc2V0IjoxOCwidmVyc2lvbiI6MX0=";
      await client.search({ ...baseSearchParams, cursor });

      const { staysSearchRequest, staysMapSearchRequestV2 } = calls[0]!.body.variables;
      expect(staysSearchRequest.cursor).toBe(cursor);
      expect(staysMapSearchRequestV2.cursor).toBe(cursor);
      const rawParamNames = staysSearchRequest.rawParams.map((p: any) => p.filterName);
      expect(rawParamNames).not.toContain("cursor");
    });

    it("throws AirbnbTimeoutError when the request times out", async () => {
      const fetchImpl: FetchLike = () => {
        throw new DOMException("The operation was aborted.", "TimeoutError");
      };
      const client = new AirbnbApiClient(makeKeyResolver(), { fetchImpl, timeoutMs: 1 });

      await expect(client.search(baseSearchParams)).rejects.toThrow(AirbnbTimeoutError);
    });

    it("throws AirbnbApiError on a non-2xx response", async () => {
      const { fetchImpl } = scriptedFetch([new Response("boom", { status: 500 })]);
      const client = new AirbnbApiClient(makeKeyResolver(), { fetchImpl });

      await expect(client.search(baseSearchParams)).rejects.toThrow(AirbnbApiError);
    });

    it("throws AirbnbApiError on malformed JSON", async () => {
      const { fetchImpl } = scriptedFetch([new Response("not json", { status: 200 })]);
      const client = new AirbnbApiClient(makeKeyResolver(), { fetchImpl });

      await expect(client.search(baseSearchParams)).rejects.toThrow(AirbnbApiError);
    });

    it("refreshes the API key and retries once on a 401, succeeding with the new key", async () => {
      const { fetchImpl, calls } = scriptedFetch([
        new Response("unauthorized", { status: 401 }),
        jsonResponse(emptySearchResponse),
      ]);
      const refreshHtml = `<html><script>window.__CONFIG={"api_config":{"key":"${REFRESHED_API_KEY}"}};</script></html>`;
      const keyResolver = makeKeyResolver(async () => new Response(refreshHtml, { status: 200 }));
      const client = new AirbnbApiClient(keyResolver, { fetchImpl });

      const result = await client.search(baseSearchParams);

      expect(result).toEqual(emptySearchResponse);
      expect(calls).toHaveLength(2);
      expect((calls[0]!.init.headers as Record<string, string>)["X-Airbnb-Api-Key"]).toBe(
        HARDCODED_API_KEY,
      );
      expect((calls[1]!.init.headers as Record<string, string>)["X-Airbnb-Api-Key"]).toBe(
        REFRESHED_API_KEY,
      );
    });

    it("refreshes the API key and retries once on a 403, succeeding with the new key", async () => {
      const { fetchImpl, calls } = scriptedFetch([
        new Response("forbidden", { status: 403 }),
        jsonResponse(emptySearchResponse),
      ]);
      const refreshHtml = `<html><script>window.__CONFIG={"api_config":{"key":"${REFRESHED_API_KEY}"}};</script></html>`;
      const keyResolver = makeKeyResolver(async () => new Response(refreshHtml, { status: 200 }));
      const client = new AirbnbApiClient(keyResolver, { fetchImpl });

      await client.search(baseSearchParams);

      expect(calls).toHaveLength(2);
    });

    it("throws AirbnbApiError when the retry after refresh also fails with 401/403", async () => {
      const { fetchImpl, calls } = scriptedFetch([
        new Response("unauthorized", { status: 401 }),
        new Response("unauthorized again", { status: 401 }),
      ]);
      const refreshHtml = `<html><script>window.__CONFIG={"api_config":{"key":"${REFRESHED_API_KEY}"}};</script></html>`;
      const keyResolver = makeKeyResolver(async () => new Response(refreshHtml, { status: 200 }));
      const client = new AirbnbApiClient(keyResolver, { fetchImpl });

      await expect(client.search(baseSearchParams)).rejects.toThrow(AirbnbApiError);
      expect(calls).toHaveLength(2);
    });

    it("propagates the resolver's error when refresh() itself fails (no cache, extraction fails)", async () => {
      const { fetchImpl } = scriptedFetch([new Response("unauthorized", { status: 401 })]);
      const keyResolver = makeKeyResolver(async () => new Response("boom", { status: 500 }));
      const client = new AirbnbApiClient(keyResolver, { fetchImpl });

      await expect(client.search(baseSearchParams)).rejects.toThrow(AirbnbApiError);
    });
  });

  describe(AirbnbApiClient.prototype.getListingDetails.name, () => {
    // Trimmed from a real StaysPdpSections response captured live against
    // https://www.airbnb.com/rooms/3367761 on 2026-08-02 (see Phase 1 write-up: the persisted
    // query returns full section content in a single POST once includeGp*Fragment=true /
    // includePdpMigration*Fragment=false are set for every section pair).
    const listingDetailsFixture: AirbnbListingDetailsResponse = {
      data: {
        presentation: {
          stayProductDetailPage: {
            sections: {
              sections: [
                {
                  sectionId: "TITLE_DEFAULT",
                  sectionContentStatus: "COMPLETE",
                  section: { title: "Upper-class luxury studio rue des Capucines" },
                },
                {
                  sectionId: "HERO_DEFAULT",
                  sectionContentStatus: "COMPLETE",
                  section: {
                    previewImages: [
                      {
                        id: "1661141524",
                        baseUrl:
                          "https://a0.muscache.com/im/pictures/miso/Hosting-3367761/original/0ef47b10-d337-4e89-8838-a1ea97bd604c.jpeg",
                      },
                    ],
                  },
                },
                {
                  sectionId: "DESCRIPTION_DEFAULT",
                  sectionContentStatus: "COMPLETE",
                  section: {
                    htmlDescription: {
                      htmlText:
                        "Located next to the prestigious place Vendôme, rue des Capucines, this bright and calm studio...",
                    },
                  },
                },
                {
                  sectionId: "AMENITIES_DEFAULT",
                  sectionContentStatus: "COMPLETE",
                  section: {
                    seeAllAmenitiesGroups: [
                      {
                        title: "Bathroom",
                        amenities: [
                          {
                            id: "pdp_v3_bathroom_45_3367761-0",
                            available: true,
                            title: "Hair dryer",
                            icon: "SYSTEM_HAIRDRYER",
                          },
                          {
                            id: "pdp_v3_bathroom_665_3367761-0",
                            available: true,
                            title: "Cleaning products",
                            icon: "SYSTEM_CLEANING_SUPPLIES",
                          },
                        ],
                      },
                    ],
                  },
                },
                {
                  sectionId: "HIGHLIGHTS_DEFAULT",
                  sectionContentStatus: "COMPLETE",
                  section: {
                    highlights: [
                      {
                        title: "Top 10% of homes",
                        subtitle:
                          "This home is highly ranked based on ratings, reviews, and reliability.",
                      },
                    ],
                  },
                },
                {
                  sectionId: "MEET_YOUR_HOST",
                  sectionContentStatus: "COMPLETE",
                  section: {
                    cardData: {
                      name: "Roumen",
                      isSuperhost: true,
                      isVerified: true,
                      ratingAverage: 4.91,
                      ratingCount: 161,
                      timeAsHost: { years: 9, months: 0 },
                      profilePictureUrl:
                        "https://a0.muscache.com/im/pictures/user/User-16991929/original/168e7ef2-d9d8-491c-9479-c775875db3e0.jpeg",
                    },
                  },
                },
                {
                  sectionId: "LOCATION_DEFAULT",
                  sectionContentStatus: "COMPLETE",
                  section: { lat: 48.8701, lng: 2.32962, subtitle: "Paris, Île-de-France, France" },
                },
                {
                  sectionId: "POLICIES_DEFAULT",
                  sectionContentStatus: "COMPLETE",
                  section: {
                    houseRules: [
                      { title: "Check-in: 4:00 PM - 9:00 PM" },
                      { title: "Checkout before 12:00 PM" },
                      { title: "2 guests maximum" },
                    ],
                    previewSafetyAndProperties: [
                      { title: "Carbon monoxide alarm" },
                      { title: "Smoke alarm" },
                    ],
                  },
                },
                {
                  sectionId: "REVIEWS_DEFAULT",
                  sectionContentStatus: "COMPLETE",
                  section: { overallCount: 17, overallRating: 4.94 },
                },
              ],
              sbuiData: {
                sectionConfiguration: {
                  root: {
                    sections: [
                      {
                        sectionId: "OVERVIEW_DEFAULT_V2",
                        sectionData: {
                          title: "Entire rental unit in Paris, France",
                          overviewItems: [
                            { title: "2 guests" },
                            { title: "1 bedroom" },
                            { title: "1 bed" },
                            { title: "1 bath" },
                          ],
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    };

    const detailsParams = { adults: 1, currency: "USD" };

    it("assembles listing details from the real captured section shapes", async () => {
      const { fetchImpl, calls } = scriptedFetch([jsonResponse(listingDetailsFixture)]);
      const client = new AirbnbApiClient(makeKeyResolver(), { fetchImpl });

      const details = await client.getListingDetails("3367761", detailsParams);

      expect(details.id).toBe("3367761");
      expect(details.title).toBe("Upper-class luxury studio rue des Capucines");
      expect(details.descriptionHtml).toContain("Located next to the prestigious place");
      expect(details.images).toEqual([
        {
          id: "1661141524",
          baseUrl:
            "https://a0.muscache.com/im/pictures/miso/Hosting-3367761/original/0ef47b10-d337-4e89-8838-a1ea97bd604c.jpeg",
        },
      ]);
      expect(details.overviewTitle).toBe("Entire rental unit in Paris, France");
      expect(details.overviewItems).toEqual(["2 guests", "1 bedroom", "1 bed", "1 bath"]);
      expect(details.amenities[0]!.title).toBe("Bathroom");
      expect(details.amenities[0]!.amenities).toHaveLength(2);
      expect(details.host).toEqual({
        name: "Roumen",
        isSuperhost: true,
        isVerified: true,
        ratingAverage: 4.91,
        ratingCount: 161,
        timeAsHost: { years: 9, months: 0 },
        profilePictureUrl:
          "https://a0.muscache.com/im/pictures/user/User-16991929/original/168e7ef2-d9d8-491c-9479-c775875db3e0.jpeg",
      });
      expect(details.location).toEqual({
        lat: 48.8701,
        lng: 2.32962,
        label: "Paris, Île-de-France, France",
      });
      expect(details.houseRules).toEqual([
        "Check-in: 4:00 PM - 9:00 PM",
        "Checkout before 12:00 PM",
        "2 guests maximum",
      ]);
      expect(details.safetyAndProperty).toEqual(["Carbon monoxide alarm", "Smoke alarm"]);
      expect(details.rating).toEqual({ value: 4.94, reviewCount: 17 });

      const requestBody = calls[0]!.body;
      expect(requestBody.operationName).toBe("StaysPdpSections");
      expect(requestBody.variables.id).toBe("U3RheUxpc3Rpbmc6MzM2Nzc2MQ==");
      expect(requestBody.variables.demandStayListingId).toBe(
        "RGVtYW5kU3RheUxpc3Rpbmc6MzM2Nzc2MQ==",
      );
    });

    it("throws AirbnbListingNotFoundError when sections come back empty with a PERMISSION_DENIED error", async () => {
      // Live-verified shape for a nonexistent/inaccessible listing id: HTTP 200, empty
      // sections array, and a top-level PERMISSION_DENIED GraphQL error.
      const notFoundResponse: AirbnbListingDetailsResponse = {
        data: {
          presentation: {
            stayProductDetailPage: {
              sections: { sections: [], sbuiData: null },
            },
          },
        },
        errors: [
          {
            message: "Permission denied for id ...",
            extensions: { errorType: "PERMISSION_DENIED" },
          },
        ],
      };
      const { fetchImpl } = scriptedFetch([jsonResponse(notFoundResponse)]);
      const client = new AirbnbApiClient(makeKeyResolver(), { fetchImpl });

      await expect(client.getListingDetails("999999999999999999", detailsParams)).rejects.toThrow(
        AirbnbListingNotFoundError,
      );
    });

    it("throws AirbnbListingNotFoundError when sections are entirely missing from the response", async () => {
      const { fetchImpl } = scriptedFetch([jsonResponse({ data: {} })]);
      const client = new AirbnbApiClient(makeKeyResolver(), { fetchImpl });

      await expect(client.getListingDetails("0", detailsParams)).rejects.toThrow(
        AirbnbListingNotFoundError,
      );
    });
  });
});
