# hestia

hestia is an MCP (Model Context Protocol) server that lets an LLM search
Airbnb accommodations using natural language — location, dates (exact or
flexible), guest counts, price range, property type, and amenities — built on
Airbnb's own (unofficial, reverse-engineered) web API. It's a sibling project
to [furaflight](https://github.com/eddienubes/furaflight), a similar MCP
server for flight search.

## Scope

hestia is **discovery only**. It searches and inspects listings — it does
**not** book, reserve, or pay for anything, and it never will. Every listing
returned includes a `listingUrl`; use that link to complete an actual booking
yourself on airbnb.com.

## Not affiliated with Airbnb

hestia is not affiliated with, endorsed by, or connected to Airbnb, Inc. in
any way. It talks to Airbnb's public web API — the same one airbnb.com's own
frontend uses — the same way a browser does. This is not an official
partner integration, and Airbnb has not reviewed or approved this project.

## Use as an MCP server

The server speaks MCP over stdio and is published to npm as `@hestia/mcp`
with precompiled binaries for every major platform — no local Bun/Node setup
needed. Add it to your MCP client's config:

```json
{
  "mcpServers": {
    "hestia": {
      "command": "npx",
      "args": ["-y", "@hestia/mcp"]
    }
  }
}
```

For Claude Code specifically, you can instead register it via the CLI:

```sh
claude mcp add hestia -- npx -y @hestia/mcp
```

## Tools

### `search`

Search Airbnb listings by location, guest count, price range, property type,
and amenities. Dates can be given as exact check-in/check-out dates, or in a
flexible mode (approximate trip length — weekend/week/month — plus one or
more target months) for when plans aren't fixed yet. Returns lean listing
summaries, each with a `listingUrl`; use `listing_details` to drill into a
specific one.

Key inputs:

- **location** — free-text place to search (city, neighborhood, landmark, region)
- **dates** — either exact `checkin`/`checkout` dates, or a flexible trip
  length + target month(s)
- **guests** — `adults`, `children`, `infants`, `pets`
- **price range** — `minPrice` / `maxPrice`, plus `currency`
- **propertyType** — entire home, private room, shared room, or hotel room
- **amenities** — filter by a list of amenities (e.g. pool, wifi, kitchen)
- **limit** / **cursor** — result count and pagination

### `listing_details`

Get full details for a specific Airbnb listing: description, amenities,
house rules, host info, images, and rating.

Key inputs:

- **listingId** — the numeric ID from a listing URL
  (`airbnb.com/rooms/<id>`) or from a prior search result's `id`
- **dates** (optional) — `checkin`/`checkout` for date-specific pricing and
  availability
- **guests** (optional) — `adults`, `children`, `infants`, `pets`
- **currency** (optional)

## Development

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run src/main.ts
```
