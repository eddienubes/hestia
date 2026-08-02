import { describe, expect, it } from "bun:test";
import { listingDetailsInputSchema } from "./listing-details.schema.ts";

const futureDate = (daysFromNow: number): string => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
};

describe("listingDetailsInputSchema — valid shapes", () => {
  it("should accept a minimal input with only listingId and apply defaults", () => {
    const result = listingDetailsInputSchema.safeParse({
      query: {
        listingId: "12345678",
      },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.query.checkin).toBeUndefined();
    expect(result.data.query.checkout).toBeUndefined();
    expect(result.data.query.adults).toBe(1);
    expect(result.data.query.children).toBe(0);
    expect(result.data.query.infants).toBe(0);
    expect(result.data.query.pets).toBe(0);
    expect(result.data.query.currency).toBe("USD");
  });

  it("should accept a valid input with listingId, checkin, and checkout", () => {
    const result = listingDetailsInputSchema.safeParse({
      query: {
        listingId: "12345678",
        checkin: futureDate(10),
        checkout: futureDate(15),
      },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.query.checkin).toBe(futureDate(10));
    expect(result.data.query.checkout).toBe(futureDate(15));
  });
});

describe("listingDetailsInputSchema — rejects invalid shapes", () => {
  it("should reject an empty listingId", () => {
    const result = listingDetailsInputSchema.safeParse({
      query: {
        listingId: "",
      },
    });
    expect(result.success).toBe(false);
  });

  it("should reject checkin provided without checkout", () => {
    const result = listingDetailsInputSchema.safeParse({
      query: {
        listingId: "12345678",
        checkin: futureDate(10),
      },
    });
    expect(result.success).toBe(false);
  });

  it("should reject checkout provided without checkin", () => {
    const result = listingDetailsInputSchema.safeParse({
      query: {
        listingId: "12345678",
        checkout: futureDate(10),
      },
    });
    expect(result.success).toBe(false);
  });

  it("should reject a checkin date in the past", () => {
    const result = listingDetailsInputSchema.safeParse({
      query: {
        listingId: "12345678",
        checkin: futureDate(-5),
        checkout: futureDate(5),
      },
    });
    expect(result.success).toBe(false);
  });

  it("should reject checkout equal to checkin", () => {
    const result = listingDetailsInputSchema.safeParse({
      query: {
        listingId: "12345678",
        checkin: futureDate(10),
        checkout: futureDate(10),
      },
    });
    expect(result.success).toBe(false);
  });

  it("should reject checkout before checkin", () => {
    const result = listingDetailsInputSchema.safeParse({
      query: {
        listingId: "12345678",
        checkin: futureDate(10),
        checkout: futureDate(5),
      },
    });
    expect(result.success).toBe(false);
  });

  it("should reject unrecognized extra fields", () => {
    const result = listingDetailsInputSchema.safeParse({
      query: {
        listingId: "12345678",
        unknownField: "surprise",
      },
    });
    expect(result.success).toBe(false);
  });
});
