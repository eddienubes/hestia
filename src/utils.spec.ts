import { describe, expect, it } from "bun:test";
import { todayIsoDate } from "./utils.ts";

describe("todayIsoDate", () => {
  it("returns a date string in YYYY-MM-DD format", () => {
    expect(todayIsoDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
