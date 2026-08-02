import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import rootPkg from "../package.json" with { type: "json" };
import type { AccommodationSearchProvider } from "./accommodation-search.provider.ts";
import { listingDetailsInputSchema } from "./listing-details.schema.ts";
import { searchInputSchema } from "./search.schema.ts";

export const createServer = (provider: AccommodationSearchProvider): McpServer => {
  const server = new McpServer({
    name: "hestia-mcp",
    title: "hestia-mcp",
    version: rootPkg.version,
    websiteUrl: "https://github.com/eddienubes/hestia",
    description:
      "Airbnb accommodation search MCP server. Find and browse Airbnb listings using natural language — discovery only, no booking.",
  });

  server.registerTool(
    "search",
    {
      title: "Search Airbnb accommodations",
      description: `Search Airbnb listings by location, guest count, price range, property type, and \
amenities. Supports exact check-in/check-out dates or a flexible date mode (approximate trip length + \
target month(s)). Returns lean listing summaries — use listing_details for full amenities, availability, \
and house rules on a specific listing. Discovery only: this does not book or reserve anything — use the \
returned listingUrl to book on airbnb.com yourself.`,
      inputSchema: searchInputSchema,
    },
    async (args) => {
      const result = await provider.search(args.query);
      if (result.listings.length === 0) {
        return {
          content: [{ type: "text", text: "No accommodations found for these criteria." }],
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    "listing_details",
    {
      title: "Get Airbnb listing details",
      description: `Get full details for a specific Airbnb listing: description, amenities, house \
rules, host info, images, and rating. Pass a listing ID from a prior search result's id field, or \
extracted from an airbnb.com/rooms/<id> URL. Discovery only — does not book or reserve.`,
      inputSchema: listingDetailsInputSchema,
    },
    async (args) => {
      const details = await provider.getListingDetails(args.query);
      return {
        content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
      };
    },
  );

  return server;
};
