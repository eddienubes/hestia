import { join } from "node:path";
import appDirs from "appdirsjs";
import { AirbnbApiError, AirbnbTimeoutError } from "./airbnb.errors.ts";

const useAppDirs = (appDirs as any).default as typeof appDirs;

// Long-lived public API key that Airbnb's own web client sends as the
// `X-Airbnb-Api-Key` header on search/details GraphQL requests, and that the
// unofficial-Airbnb-API ecosystem has relied on for years. Confirmed live on
// 2026-08-02 via a fresh, logged-out `curl` fetch of https://www.airbnb.com/,
// where it's embedded verbatim as `api_config":{"key":"d306zoy...","baseUrl"`.
// Tried first, with zero network/disk I/O, on every request.
const HARDCODED_API_KEY = "d306zoyjsyarp7ifhu67rjxn52tv0t20";

// The key is observed to barely rotate in practice, so a week-long cache TTL
// (matching flights-mcp's LocationResolver) avoids re-fetching the homepage
// on every refresh() while still recovering within a reasonable window if
// Airbnb ever does rotate it.
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;
const PAGE_URL = "https://www.airbnb.com/";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

// Matches the `api_config":{"key":"<32-char key>"...` fragment Airbnb embeds
// in its server-rendered homepage HTML - verified via a live curl fetch
// against https://www.airbnb.com/ (see comment on HARDCODED_API_KEY above).
const API_KEY_PATTERN = /"key":"([a-z0-9]{32})"/;

interface CacheFile {
  fetchedAt: number;
  key: string;
}

const defaultCacheDir = (): string => useAppDirs({ appName: "hestia-mcp" }).cache;

/** Narrowed down to what this file actually calls, so tests can inject a plain stub function instead of a full `typeof fetch`. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface AirbnbApiKeyResolverOptions {
  /** Overrides the appdirsjs-computed cache directory - mainly for tests. */
  cacheDir?: string;
  /** Overrides the global `fetch` used to load the Airbnb page - mainly for tests. */
  fetchImpl?: FetchLike;
  /** Overrides the Airbnb page URL live extraction is attempted against - mainly for tests. */
  pageUrl?: string;
}

/**
 * Resolves the `X-Airbnb-Api-Key` header value used to authenticate against
 * Airbnb's unofficial GraphQL search/details API.
 *
 * Intended usage from the API client (a later chunk):
 *   1. Call `getKey()` before every request. It's synchronous and never
 *      touches the network or disk, so it's cheap to call per-request; on a
 *      cold start it returns the hardcoded constant.
 *   2. If a request comes back 401/403, call `refresh()` once and retry the
 *      same request with the key it returns.
 */
export class AirbnbApiKeyResolver {
  private readonly cacheFile: string;
  private readonly fetchImpl: FetchLike;
  private readonly pageUrl: string;
  private currentKey: string = HARDCODED_API_KEY;

  constructor(options: AirbnbApiKeyResolverOptions = {}) {
    this.cacheFile = join(options.cacheDir ?? defaultCacheDir(), "api-key.json");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.pageUrl = options.pageUrl ?? PAGE_URL;
  }

  /**
   * Returns the current best-guess API key. Does no network or disk I/O:
   * on cold start (before `refresh()` has ever succeeded) this is just the
   * hardcoded constant held in memory.
   */
  getKey(): string {
    return this.currentKey;
  }

  /**
   * Attempts to obtain a fresher key than the current one: a still-fresh
   * on-disk cache entry if one exists, otherwise a live extraction from
   * Airbnb's homepage. If the live fetch/extraction fails, falls back to a
   * stale on-disk cache entry when one exists.
   *
   * Updates the value `getKey()` returns on success.
   *
   * Throws `AirbnbApiError` if there is no cache at all and live extraction
   * also fails - it deliberately never falls back to re-returning the
   * hardcoded key, since callers only reach `refresh()` after that key was
   * already rejected by the API.
   */
  async refresh(): Promise<string> {
    const cached = await this.readCache();
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      this.currentKey = cached.key;
      return cached.key;
    }

    try {
      const key = await this.extractLiveKey();
      await this.writeCache(key);
      this.currentKey = key;
      return key;
    } catch (error) {
      if (cached) {
        this.currentKey = cached.key;
        return cached.key;
      }
      if (error instanceof AirbnbApiError || error instanceof AirbnbTimeoutError) throw error;
      throw new AirbnbApiError(
        `Failed to extract a live Airbnb API key and no cached copy is available: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async extractLiveKey(): Promise<string> {
    let response: Response;
    try {
      response = await this.fetchImpl(this.pageUrl, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError")
      ) {
        throw new AirbnbTimeoutError(
          `Request to ${this.pageUrl} timed out after ${FETCH_TIMEOUT_MS}ms.`,
        );
      }
      throw error;
    }
    if (!response.ok) {
      throw new AirbnbApiError(`Failed to fetch ${this.pageUrl}: HTTP ${response.status}.`);
    }

    const html = await response.text();
    const match = API_KEY_PATTERN.exec(html);
    if (!match?.[1]) {
      throw new AirbnbApiError(`Could not find an API key pattern in ${this.pageUrl}.`);
    }
    return match[1];
  }

  private async readCache(): Promise<CacheFile | undefined> {
    try {
      const file = Bun.file(this.cacheFile);
      if (!(await file.exists())) return undefined;
      return (await file.json()) as CacheFile;
    } catch {
      return undefined;
    }
  }

  private async writeCache(key: string): Promise<void> {
    await Bun.write(
      this.cacheFile,
      JSON.stringify({ fetchedAt: Date.now(), key } satisfies CacheFile),
    );
  }
}
