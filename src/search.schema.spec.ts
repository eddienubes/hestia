import { describe, expect, it } from "bun:test";
import { searchInputSchema } from "./search.schema.ts";

const futureDate = (daysFromNow: number): string => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
};

describe("searchInputSchema — valid shapes", () => {
  it("should accept a minimal exact-mode search and apply defaults", () => {
    const result = searchInputSchema.safeParse({
      query: {
        dateMode: "exact",
        location: "Lisbon, Portugal",
        checkin: futureDate(10),
        checkout: futureDate(15),
      },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.query.adults).toBe(1);
    expect(result.data.query.children).toBe(0);
    expect(result.data.query.infants).toBe(0);
    expect(result.data.query.pets).toBe(0);
    expect(result.data.query.currency).toBe("USD");
    expect(result.data.query.limit).toBe(20);
  });

  it("should accept a minimal flexible-mode search and apply defaults", () => {
    const result = searchInputSchema.safeParse({
      query: {
        dateMode: "flexible",
        location: "Lisbon, Portugal",
        flexibleTripLength: "week",
        flexibleMonths: ["october"],
      },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.query.adults).toBe(1);
    expect(result.data.query.currency).toBe("USD");
    expect(result.data.query.limit).toBe(20);
  });

  it("should accept a fully specified exact-mode search", () => {
    const result = searchInputSchema.safeParse({
      query: {
        dateMode: "exact",
        location: "Lisbon, Portugal",
        placeId: "ChIJ00",
        checkin: futureDate(10),
        checkout: futureDate(15),
        adults: 2,
        children: 1,
        infants: 1,
        pets: 1,
        minPrice: 50,
        maxPrice: 200,
        currency: "EUR",
        propertyType: "entire_home",
        amenities: ["wifi", "kitchen"],
        limit: 10,
        cursor: "abc123",
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("searchInputSchema — rejects invalid shapes", () => {
  it("should reject a checkin date in the past", () => {
    const result = searchInputSchema.safeParse({
      query: {
        dateMode: "exact",
        location: "Lisbon, Portugal",
        checkin: futureDate(-5),
        checkout: futureDate(5),
      },
    });
    expect(result.success).toBe(false);
  });

  it("should reject checkout equal to checkin", () => {
    const result = searchInputSchema.safeParse({
      query: {
        dateMode: "exact",
        location: "Lisbon, Portugal",
        checkin: futureDate(10),
        checkout: futureDate(10),
      },
    });
    expect(result.success).toBe(false);
  });

  it("should reject checkout before checkin", () => {
    const result = searchInputSchema.safeParse({
      query: {
        dateMode: "exact",
        location: "Lisbon, Portugal",
        checkin: futureDate(10),
        checkout: futureDate(5),
      },
    });
    expect(result.success).toBe(false);
  });

  it("should reject minPrice greater than maxPrice in exact mode", () => {
    const result = searchInputSchema.safeParse({
      query: {
        dateMode: "exact",
        location: "Lisbon, Portugal",
        checkin: futureDate(10),
        checkout: futureDate(15),
        minPrice: 200,
        maxPrice: 100,
      },
    });
    expect(result.success).toBe(false);
  });

  it("should reject minPrice greater than maxPrice in flexible mode", () => {
    const result = searchInputSchema.safeParse({
      query: {
        dateMode: "flexible",
        location: "Lisbon, Portugal",
        flexibleTripLength: "week",
        flexibleMonths: ["october"],
        minPrice: 200,
        maxPrice: 100,
      },
    });
    expect(result.success).toBe(false);
  });

  it("should reject an unknown propertyType", () => {
    const result = searchInputSchema.safeParse({
      query: {
        dateMode: "exact",
        location: "Lisbon, Portugal",
        checkin: futureDate(10),
        checkout: futureDate(15),
        propertyType: "castle",
      },
    });
    expect(result.success).toBe(false);
  });

  it("should reject an amenity not in the known vocabulary", () => {
    const result = searchInputSchema.safeParse({
      query: {
        dateMode: "exact",
        location: "Lisbon, Portugal",
        checkin: futureDate(10),
        checkout: futureDate(15),
        amenities: ["wifi", "jacuzzi"],
      },
    });
    expect(result.success).toBe(false);
  });

  it("should reject an empty flexibleMonths array", () => {
    const result = searchInputSchema.safeParse({
      query: {
        dateMode: "flexible",
        location: "Lisbon, Portugal",
        flexibleTripLength: "week",
        flexibleMonths: [],
      },
    });
    expect(result.success).toBe(false);
  });

  it("should reject an invalid date format", () => {
    const result = searchInputSchema.safeParse({
      query: {
        dateMode: "exact",
        location: "Lisbon, Portugal",
        checkin: "10/09/2026",
        checkout: futureDate(15),
      },
    });
    expect(result.success).toBe(false);
  });

  it("should reject an invalid calendar date", () => {
    const result = searchInputSchema.safeParse({
      query: {
        dateMode: "exact",
        location: "Lisbon, Portugal",
        checkin: "2026-02-30",
        checkout: futureDate(15),
      },
    });
    expect(result.success).toBe(false);
  });

  it("should reject a limit above the hard cap of 50", () => {
    const result = searchInputSchema.safeParse({
      query: {
        dateMode: "exact",
        location: "Lisbon, Portugal",
        checkin: futureDate(10),
        checkout: futureDate(15),
        limit: 100,
      },
    });
    expect(result.success).toBe(false);
  });

  it("should reject an empty location", () => {
    const result = searchInputSchema.safeParse({
      query: {
        dateMode: "exact",
        location: "",
        checkin: futureDate(10),
        checkout: futureDate(15),
      },
    });
    expect(result.success).toBe(false);
  });

  it("should reject a missing dateMode", () => {
    const result = searchInputSchema.safeParse({
      query: {
        location: "Lisbon, Portugal",
        checkin: futureDate(10),
        checkout: futureDate(15),
      },
    });
    expect(result.success).toBe(false);
  });

  it("should reject dateMode 'flexible' payload that mixes in exact-mode fields (checkin)", () => {
    const result = searchInputSchema.safeParse({
      query: {
        dateMode: "flexible",
        location: "Lisbon, Portugal",
        flexibleTripLength: "week",
        flexibleMonths: ["october"],
        checkin: futureDate(10),
      },
    });
    expect(result.success).toBe(false);
  });

  it("should reject dateMode 'exact' payload that mixes in flexible-mode fields (flexibleMonths)", () => {
    const result = searchInputSchema.safeParse({
      query: {
        dateMode: "exact",
        location: "Lisbon, Portugal",
        checkin: futureDate(10),
        checkout: futureDate(15),
        flexibleMonths: ["october"],
      },
    });
    expect(result.success).toBe(false);
  });
});
