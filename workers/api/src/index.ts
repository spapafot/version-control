/**
 * vc-api-proxy - Cloudflare Worker in front of the certification backend.
 *
 * api.versioncontrol.gr -> AWS Lambda Function URL (AuthType NONE).
 * The Lambda is public but its FastAPI middleware requires the shared
 * X-Proxy-Secret header, which only this Worker injects - making this
 * Worker the only usable front door (CORS, edge cache, client IP).
 */

export interface Env {
  /**
   * Lambda Function URL origin, no trailing slash (FUNCTION_URL in
   * scripts/aws/out/stack.env). Set BY HAND as a plaintext dashboard
   * variable, like PROXY_SECRET below - kept out of git so the URL can't be
   * scraped and hammered directly (bypassing Cloudflare's rate limits).
   */
  LAMBDA_URL: string;
  /**
   * Shared secret; set BY HAND as a plaintext variable in the Cloudflare
   * dashboard (Workers -> vc-api-proxy -> Settings -> Variables). keep_vars
   * in wrangler.jsonc stops deploys from wiping it.
   */
  PROXY_SECRET: string;
}

const ALLOWED_ORIGINS = [
  "https://versioncontrol.gr",
  "https://www.versioncontrol.gr",
  // Local development - remove these two before going strict:
  "http://localhost:3000",
  "http://localhost:8788",
];

/**
 * Public, unauthenticated GET routes that are safe to cache at the edge.
 *
 * The first alternative needs the trailing slash: those routes always carry a
 * credential id. The leaderboard has no path segment after it and varies only by
 * query string, which the cache key (the full URL) already covers, so it is
 * matched with $ instead. Quiz session and submit routes match neither and are
 * therefore never cached, which is what we want.
 */
const CACHEABLE_PATH =
  /^\/v1\/(verify|credentials)\/|^\/v1\/quiz\/leaderboard$/;

/** CORS headers for a given request Origin (empty ACAO when not allowed). */
function corsHeaders(origin: string | null): [string, string][] {
  const headers: [string, string][] = [["Vary", "Origin"]];
  if (origin !== null && ALLOWED_ORIGINS.includes(origin)) {
    headers.push(["Access-Control-Allow-Origin", origin]);
  }
  return headers;
}

/** Rewrap a response (cached ones may be immutable) and apply CORS headers. */
function withCors(response: Response, origin: string | null): Response {
  const out = new Response(response.body, response);
  for (const [k, v] of corsHeaders(origin)) {
    out.headers.set(k, v);
  }
  return out;
}

/** Copy request headers minus host/cookie/cf-*; add proxy secret + client IP. */
function upstreamHeaders(request: Request, env: Env): Headers {
  const headers = new Headers();
  for (const [name, value] of request.headers) {
    const n = name.toLowerCase();
    if (n === "host" || n === "cookie" || n.startsWith("cf-")) continue;
    headers.append(name, value);
  }
  headers.set("X-Proxy-Secret", env.PROXY_SECRET);
  const clientIp = request.headers.get("cf-connecting-ip");
  if (clientIp !== null) {
    headers.set("X-Client-IP", clientIp);
  }
  return headers;
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const origin = request.headers.get("Origin");

    // CORS preflight - answered at the edge, never forwarded upstream.
    if (request.method === "OPTIONS") {
      const headers = new Headers(corsHeaders(origin));
      if (headers.has("Access-Control-Allow-Origin")) {
        headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
        headers.set(
          "Access-Control-Allow-Headers",
          "authorization,content-type",
        );
        headers.set("Access-Control-Max-Age", "86400");
      }
      return new Response(null, { status: 204, headers });
    }

    const url = new URL(request.url);
    // Only public verification/credential reads are cacheable; authenticated
    // routes never match this regex, so they are never cached.
    const cacheable =
      request.method === "GET" && CACHEABLE_PATH.test(url.pathname);
    const cache = caches.default;
    // Key on the incoming public URL (path + query), not the Lambda URL.
    const cacheKey = url.toString();

    if (cacheable) {
      const hit = await cache.match(cacheKey);
      if (hit !== undefined) {
        return withCors(hit, origin);
      }
    }

    let upstream: Response;
    try {
      upstream = await fetch(
        new Request(env.LAMBDA_URL + url.pathname + url.search, {
          method: request.method,
          headers: upstreamHeaders(request, env),
          body: request.body,
          redirect: "manual",
        }),
      );
    } catch {
      return new Response(JSON.stringify({ code: "upstream_unavailable" }), {
        status: 502,
        headers: [["Content-Type", "application/json"], ...corsHeaders(origin)],
      });
    }

    // Mutable copy, streamed through. Cache BEFORE adding CORS headers so a
    // cached entry never replays one origin's ACAO to another origin.
    const response = new Response(upstream.body, upstream);

    if (
      cacheable &&
      (upstream.status === 200 || upstream.status === 404) &&
      response.headers.has("Cache-Control")
    ) {
      ctx.waitUntil(
        // cache.put rejects on non-cacheable Cache-Control (no-store etc.);
        // that is the backend's call - swallow instead of failing the request.
        cache.put(cacheKey, response.clone()).catch(() => {}),
      );
    }

    for (const [k, v] of corsHeaders(origin)) {
      response.headers.set(k, v);
    }
    return response;
  },
} satisfies ExportedHandler<Env>;
