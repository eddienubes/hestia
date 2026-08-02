import { describe, expect, it } from "bun:test";
import {
  buildListingUrl,
  buildRawParam,
  encodeGlobalId,
  HOTEL_ROOM_TAG,
  parseAvgRatingA11yLabel,
  parseOverviewCount,
  propertyTypeToRoomTypeWireValue,
  tripLengthToWireValue,
} from "./airbnb.utils.ts";

describe(buildRawParam.name, () => {
  it("builds a filterName/filterValues pair from variadic args", () => {
    expect(buildRawParam("amenities", "4", "8")).toEqual({
      filterName: "amenities",
      filterValues: ["4", "8"],
    });
  });

  it("supports a single value", () => {
    expect(buildRawParam("query", "Paris, France")).toEqual({
      filterName: "query",
      filterValues: ["Paris, France"],
    });
  });
});

describe(buildListingUrl.name, () => {
  it("builds the canonical rooms URL from a numeric id", () => {
    expect(buildListingUrl("3367761")).toBe("https://www.airbnb.com/rooms/3367761");
  });
});

describe(tripLengthToWireValue.name, () => {
  it("maps weekend to the live-confirmed weekend_trip wire value", () => {
    expect(tripLengthToWireValue("weekend")).toBe("weekend_trip");
  });

  it("maps week to the live-confirmed one_week wire value", () => {
    expect(tripLengthToWireValue("week")).toBe("one_week");
  });

  it("maps month to the live-confirmed one_month wire value", () => {
    expect(tripLengthToWireValue("month")).toBe("one_month");
  });
});

describe(propertyTypeToRoomTypeWireValue.name, () => {
  it("maps entire_home to the live-confirmed 'Entire home/apt' wire value", () => {
    expect(propertyTypeToRoomTypeWireValue("entire_home")).toBe("Entire home/apt");
  });

  it("maps private_room to the live-confirmed 'Private room' wire value", () => {
    expect(propertyTypeToRoomTypeWireValue("private_room")).toBe("Private room");
  });

  it("maps shared_room to the inferred 'Shared room' wire value", () => {
    expect(propertyTypeToRoomTypeWireValue("shared_room")).toBe("Shared room");
  });
});

describe("HOTEL_ROOM_TAG", () => {
  it("is the live-confirmed knowledge-graph tag for hotel rooms", () => {
    expect(HOTEL_ROOM_TAG).toBe("Tag:9613");
  });
});

describe(encodeGlobalId.name, () => {
  it("encodes a type name and numeric id as base64('TypeName:id'), matching Airbnb's Relay ids", () => {
    expect(encodeGlobalId("StayListing", "3367761")).toBe("U3RheUxpc3Rpbmc6MzM2Nzc2MQ==");
    expect(encodeGlobalId("DemandStayListing", "3367761")).toBe(
      "RGVtYW5kU3RheUxpc3Rpbmc6MzM2Nzc2MQ==",
    );
  });
});

describe(parseAvgRatingA11yLabel.name, () => {
  it("extracts the numeric rating and review count from a real a11y label", () => {
    expect(parseAvgRatingA11yLabel("4.94 out of 5 average rating,  17 reviews")).toEqual({
      value: 4.94,
      reviewCount: 17,
    });
  });

  it("handles a singular review count", () => {
    expect(parseAvgRatingA11yLabel("5.0 out of 5 average rating,  1 review")).toEqual({
      value: 5.0,
      reviewCount: 1,
    });
  });

  it("handles thousands-separated review counts", () => {
    expect(parseAvgRatingA11yLabel("4.8 out of 5 average rating,  1,234 reviews")).toEqual({
      value: 4.8,
      reviewCount: 1234,
    });
  });

  it("returns null/0 when the label is null (no reviews yet)", () => {
    expect(parseAvgRatingA11yLabel(null)).toEqual({ value: null, reviewCount: 0 });
  });

  it("returns null/0 when the label is undefined", () => {
    expect(parseAvgRatingA11yLabel(undefined)).toEqual({ value: null, reviewCount: 0 });
  });

  it("returns null/0 when the label doesn't match the expected pattern", () => {
    expect(parseAvgRatingA11yLabel("something unexpected")).toEqual({
      value: null,
      reviewCount: 0,
    });
  });
});

describe(parseOverviewCount.name, () => {
  const items = ["2 guests", "1 bedroom", "1 bed", "1 bath"];

  it("extracts a singular count", () => {
    expect(parseOverviewCount(items, "bedroom")).toBe(1);
  });

  it("extracts a plural count", () => {
    expect(parseOverviewCount(items, "guest")).toBe(2);
  });

  it("returns undefined when no item matches the unit word", () => {
    expect(parseOverviewCount(items, "study")).toBeUndefined();
  });
});
