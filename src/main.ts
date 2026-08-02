#!/usr/bin/env bun
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { AirbnbApiClient } from "./airbnb/airbnb.api-client.ts";
import { AirbnbApiKeyResolver } from "./airbnb/airbnb.api-key-resolver.ts";
import { AirbnbProvider } from "./airbnb/airbnb.provider.ts";
import { createServer } from "./mcp.server.ts";

const provider = new AirbnbProvider(new AirbnbApiClient(new AirbnbApiKeyResolver()));
const server = createServer(provider);

await server.connect(new StdioServerTransport());
