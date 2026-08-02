import { z } from "zod";
import { AMENITY_NAMES } from "./airbnb/airbnb.amenities.ts";
import { todayIsoDate } from "./utils.ts";

const isValidIsoDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
};

const dateStringSchema = z
  .string()
  .refine(isValidIsoDate, { message: "must be a valid date in YYYY-MM-DD format" });

const amenitiesDescription = `Filter by amenities. Valid values: ${AMENITY_NAMES.join(", ")}.`;

const commonShape = {
  location: z
    .string()
    .min(1)
    .describe(
      "Free-text place to search (city, neighborhood, landmark, region), e.g. 'Lisbon, Portugal'. Airbnb resolves this server-side.",
    ),
  placeId: z
    .string()
    .optional()
    .describe(
      "Optional Google Places ID if already known; usually unnecessary — prefer `location`.",
    ),
  adults: z.number().int().min(1).default(1).describe("Number of adult guests."),
  children: z.number().int().min(0).default(0).describe("Number of child guests."),
  infants: z.number().int().min(0).default(0).describe("Number of infant guests."),
  pets: z.number().int().min(0).default(0).describe("Number of pets."),
  minPrice: z.number().min(0).optional().describe("Minimum nightly price filter, in `currency`."),
  maxPrice: z.number().min(0).optional().describe("Maximum nightly price filter, in `currency`."),
  currency: z.string().min(1).default("USD").describe("Currency code for prices, e.g. USD, EUR."),
  propertyType: z
    .enum(["entire_home", "private_room", "shared_room", "hotel_room"])
    .optional()
    .describe("Filter by property type."),
  amenities: z.array(z.enum(AMENITY_NAMES)).optional().describe(amenitiesDescription),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .describe("Max number of results to return (hard cap 50)."),
  cursor: z
    .string()
    .optional()
    .describe(
      "Opaque pagination token from a previous search response's `nextCursor`; omit for the first page.",
    ),
};

const exactSchema = z
  .object({
    dateMode: z.literal("exact"),
    checkin: dateStringSchema.describe("Check-in date (YYYY-MM-DD)."),
    checkout: dateStringSchema.describe("Check-out date (YYYY-MM-DD)."),
    ...commonShape,
  })
  .strict();

const flexibleSchema = z
  .object({
    dateMode: z.literal("flexible"),
    flexibleTripLength: z
      .enum(["weekend", "week", "month"])
      .describe("Roughly how long to stay when exact dates aren't fixed yet."),
    flexibleMonths: z
      .array(
        z.enum([
          "january",
          "february",
          "march",
          "april",
          "may",
          "june",
          "july",
          "august",
          "september",
          "october",
          "november",
          "december",
        ]),
      )
      .min(1)
      .max(12)
      .describe("One or more target months to search within, e.g. ['october']."),
    ...commonShape,
  })
  .strict();

const searchQuerySchema = z
  .discriminatedUnion("dateMode", [exactSchema, flexibleSchema])
  .superRefine((data, ctx) => {
    if (data.dateMode === "exact") {
      if (data.checkin < todayIsoDate()) {
        ctx.addIssue({
          code: "custom",
          message: "checkin cannot be in the past.",
          path: ["checkin"],
        });
      }
      if (data.checkout <= data.checkin) {
        ctx.addIssue({
          code: "custom",
          message: "checkout must be strictly after checkin.",
          path: ["checkout"],
        });
      }
    }

    if (
      data.minPrice !== undefined &&
      data.maxPrice !== undefined &&
      data.minPrice > data.maxPrice
    ) {
      ctx.addIssue({
        code: "custom",
        message: "minPrice cannot be greater than maxPrice.",
        path: ["maxPrice"],
      });
    }
  });

export const searchInputSchema = z.object({ query: searchQuerySchema });

export type SearchInput = z.infer<typeof searchInputSchema>;
