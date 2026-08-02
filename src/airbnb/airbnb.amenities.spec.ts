import { describe, expect, it } from "bun:test";
import { AMENITIES, AMENITY_NAMES } from "./airbnb.amenities.ts";

describe("AMENITIES", () => {
  it("maps every amenity to a positive integer id", () => {
    for (const id of Object.values(AMENITIES)) {
      expect(Number.isInteger(id)).toBe(true);
      expect(id).toBeGreaterThan(0);
    }
  });

  it("has no duplicate ids across entries", () => {
    const ids = Object.values(AMENITIES);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has AMENITY_NAMES matching the AMENITIES keys exactly", () => {
    const names: readonly string[] = AMENITY_NAMES;
    expect(new Set(names)).toEqual(new Set(Object.keys(AMENITIES)));
    expect(names.length).toBe(Object.keys(AMENITIES).length);
  });
});
