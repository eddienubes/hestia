import { z } from "zod";
import { dateStringSchema } from "./search.schema.ts";
import { todayIsoDate } from "./utils.ts";

const listingDetailsQuerySchema = z
  .object({
    listingId: z
      .string()
      .min(1)
      .describe(
        "Airbnb listing ID — the numeric ID from a listing URL like https://www.airbnb.com/rooms/12345678, or from a prior search result's `id`.",
      ),
    checkin: dateStringSchema
      .optional()
      .describe("Optional check-in date (YYYY-MM-DD) for date-specific pricing and availability."),
    checkout: dateStringSchema
      .optional()
      .describe("Optional check-out date (YYYY-MM-DD) for date-specific pricing and availability."),
    adults: z.number().int().min(1).default(1).describe("Number of adult guests."),
    children: z.number().int().min(0).default(0).describe("Number of child guests."),
    infants: z.number().int().min(0).default(0).describe("Number of infant guests."),
    pets: z.number().int().min(0).default(0).describe("Number of pets."),
    currency: z.string().min(1).default("USD").describe("Currency code for prices, e.g. USD, EUR."),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.checkin === undefined && data.checkout === undefined) {
      return;
    }

    if (data.checkin === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "checkin is required when checkout is provided.",
        path: ["checkin"],
      });
      return;
    }

    if (data.checkout === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "checkout is required when checkin is provided.",
        path: ["checkout"],
      });
      return;
    }

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
  });

export const listingDetailsInputSchema = z.object({ query: listingDetailsQuerySchema });

export type ListingDetailsInput = z.infer<typeof listingDetailsInputSchema>;
