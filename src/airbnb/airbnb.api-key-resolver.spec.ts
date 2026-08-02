import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AirbnbApiKeyResolver, type FetchLike } from "./airbnb.api-key-resolver.ts";
import { AirbnbApiError } from "./airbnb.errors.ts";

const HARDCODED_API_KEY = "d306zoyjsyarp7ifhu67rjxn52tv0t20";
const FRESH_LIVE_KEY = "abcdef0123456789abcdef0123456789";
const STALE_LIVE_KEY = "11111111111111111111111111111111".slice(0, 32);

const fixtureHtml = (key: string): string =>
  `<html><head><script>window.__CONFIG={"locale":"en","api_config":{"key":"${key}","baseUrl":"/api"}};</script></head></html>`;

const throwingFetch: FetchLike = () => {
  throw new Error("fetch should not have been called");
};

const okFetch =
  (body: string): FetchLike =>
  async () =>
    new Response(body, { status: 200 });

const failingFetch: FetchLike = async () => new Response("boom", { status: 500 });

let cacheDir: string;

beforeEach(() => {
  cacheDir = mkdtempSync(join(tmpdir(), "hestia-api-key-resolver-"));
});

afterEach(() => {
  rmSync(cacheDir, { recursive: true, force: true });
});

const writeCacheFile = async (fetchedAt: number, key: string): Promise<void> => {
  await Bun.write(join(cacheDir, "api-key.json"), JSON.stringify({ fetchedAt, key }));
};

describe(AirbnbApiKeyResolver.name, () => {
  describe(AirbnbApiKeyResolver.prototype.getKey.name, () => {
    it("returns the hardcoded key on cold start without any network call", () => {
      const resolver = new AirbnbApiKeyResolver({ cacheDir, fetchImpl: throwingFetch });

      expect(resolver.getKey()).toBe(HARDCODED_API_KEY);
    });
  });

  describe(AirbnbApiKeyResolver.prototype.refresh.name, () => {
    it("extracts a fresh key from a live page fetch and updates getKey()", async () => {
      const resolver = new AirbnbApiKeyResolver({
        cacheDir,
        fetchImpl: okFetch(fixtureHtml(FRESH_LIVE_KEY)),
      });

      const key = await resolver.refresh();

      expect(key).toBe(FRESH_LIVE_KEY);
      expect(resolver.getKey()).toBe(FRESH_LIVE_KEY);
    });

    it("persists the freshly extracted key to disk so it survives a new instance", async () => {
      const first = new AirbnbApiKeyResolver({
        cacheDir,
        fetchImpl: okFetch(fixtureHtml(FRESH_LIVE_KEY)),
      });
      await first.refresh();

      const second = new AirbnbApiKeyResolver({ cacheDir, fetchImpl: throwingFetch });
      const key = await second.refresh();

      expect(key).toBe(FRESH_LIVE_KEY);
    });

    it("falls back to a stale on-disk cache when the live fetch fails", async () => {
      const staleTimestamp = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days old, well past TTL
      await writeCacheFile(staleTimestamp, STALE_LIVE_KEY);
      const resolver = new AirbnbApiKeyResolver({ cacheDir, fetchImpl: failingFetch });

      const key = await resolver.refresh();

      expect(key).toBe(STALE_LIVE_KEY);
      expect(resolver.getKey()).toBe(STALE_LIVE_KEY);
    });

    it("reuses a fresh on-disk cache entry without fetching", async () => {
      await writeCacheFile(Date.now(), STALE_LIVE_KEY);
      const resolver = new AirbnbApiKeyResolver({ cacheDir, fetchImpl: throwingFetch });

      const key = await resolver.refresh();

      expect(key).toBe(STALE_LIVE_KEY);
    });

    it("fetches a fresh key when the on-disk cache entry has expired", async () => {
      const expiredTimestamp = Date.now() - 8 * 24 * 60 * 60 * 1000; // TTL is 7 days
      await writeCacheFile(expiredTimestamp, STALE_LIVE_KEY);
      const resolver = new AirbnbApiKeyResolver({
        cacheDir,
        fetchImpl: okFetch(fixtureHtml(FRESH_LIVE_KEY)),
      });

      const key = await resolver.refresh();

      expect(key).toBe(FRESH_LIVE_KEY);
    });

    it("throws AirbnbApiError when there is no cache and the live fetch fails", async () => {
      const resolver = new AirbnbApiKeyResolver({ cacheDir, fetchImpl: failingFetch });

      await expect(resolver.refresh()).rejects.toThrow(AirbnbApiError);
    });

    it("throws AirbnbApiError when there is no cache and extraction finds no key", async () => {
      const resolver = new AirbnbApiKeyResolver({
        cacheDir,
        fetchImpl: okFetch("<html>no key here</html>"),
      });

      await expect(resolver.refresh()).rejects.toThrow(AirbnbApiError);
    });
  });
});
