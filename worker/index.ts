/**
 * Edge worker for versioncontrol.gr. Invoked ONLY for /verify/* (see
 * assets.run_worker_first in wrangler.jsonc); every other path is served by
 * the static asset layer exactly as before this worker existed.
 *
 * /verify/{credentialId}/ has no static page (credential ids cannot be known
 * at build time), so the worker serves the static /verify/ shell at HTTP 200
 * and rewrites it per credential: head metadata for link previews (LinkedIn's
 * crawler runs no JS), a JSON data island the client screen renders from, and
 * crawler-visible summary text.
 */
import {
  certDescription,
  certTitle,
  credentialJsonLd,
  errorDescription,
  errorSlotHtml,
  islandJson,
  notFoundTitle,
  revokedTitle,
  slotHtml,
  type VerifyPayload,
} from "./cert-meta";

const API_VERIFY_BASE = "https://api.versioncontrol.gr/v1/verify/";
const ID_RE = /^VC-GIT-F-[0-9A-HJKMNP-TV-Z]{8}$/;

type VerifyResult = VerifyPayload | { status: "not_found" };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/verify\/([^/]+)\/?$/);
    if (!match) return env.ASSETS.fetch(request);

    let raw: string;
    try {
      raw = decodeURIComponent(match[1]);
    } catch {
      return env.ASSETS.fetch(request);
    }
    const id = raw.toUpperCase();
    if (!ID_RE.test(id)) return env.ASSETS.fetch(request); // asset layer 404s as today

    // one canonical shape per credential: uppercase + trailing slash
    if (raw !== id || !url.pathname.endsWith("/")) {
      return Response.redirect(`${url.origin}/verify/${id}/`, 301);
    }

    const [shell, result] = await Promise.all([
      env.ASSETS.fetch(new URL("/verify/", request.url)),
      lookup(id, ctx),
    ]);

    // API unreachable: serve the untouched shell (island stays null) so the
    // client screen's direct fetch can take over. Degrade, never error.
    if (result === null) return shell;

    return result.status === "not_found"
      ? renderError(shell, id, false)
      : renderCert(shell, result);
  },
} satisfies ExportedHandler<Env>;

/** Verify a credential against the API, cached at this colo. */
async function lookup(id: string, ctx: ExecutionContext): Promise<VerifyResult | null> {
  const key = new Request(API_VERIFY_BASE + id);
  const cache = caches.default;

  const hit = await cache.match(key);
  if (hit) return (await hit.json()) as VerifyResult;

  let upstream: Response;
  try {
    upstream = await fetch(key);
  } catch {
    return null;
  }
  if (upstream.status >= 500) return null;

  let data: VerifyResult;
  try {
    data = (await upstream.json()) as VerifyResult;
  } catch {
    return null;
  }

  // Stored as a normalized 200 (the payload's own `status` field carries the
  // outcome): short TTLs bound revocation propagation without re-fetching for
  // every crawler hit when a link is shared.
  const ttl = data.status === "not_found" ? 60 : 300;
  const cacheable = new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json", "cache-control": `s-maxage=${ttl}` },
  });
  ctx.waitUntil(cache.put(key, cacheable).catch(() => {}));

  return data;
}

function setText(text: string) {
  return {
    element(el: Element) {
      el.setInnerContent(text);
    },
  };
}

function setAttr(name: string, value: string) {
  return {
    element(el: Element) {
      el.setAttribute(name, value);
    },
  };
}

function setHtml(html: string) {
  return {
    element(el: Element) {
      el.setInnerContent(html, { html: true });
    },
  };
}

function renderCert(shell: Response, cert: VerifyPayload): Response {
  const revoked = cert.status === "revoked";
  const pageUrl = cert.urls.verify;
  const title = revoked ? revokedTitle() : certTitle(cert);
  const description = revoked
    ? errorDescription(cert.credentialId, true)
    : certDescription(cert);

  let rewriter = new HTMLRewriter()
    .on("title", setText(title))
    .on('meta[name="description"]', setAttr("content", description))
    .on('meta[property="og:title"]', setAttr("content", title))
    .on('meta[property="og:description"]', setAttr("content", description))
    .on('meta[property="og:url"]', setAttr("content", pageUrl))
    .on('link[rel="canonical"]', setAttr("href", pageUrl))
    .on('script[id="__CERT__"]', setHtml(islandJson({ ok: true, cert })))
    .on(
      "div[data-cert-slot]",
      setHtml(revoked ? errorSlotHtml(cert.credentialId, true) : slotHtml(cert)),
    );

  if (!revoked) {
    rewriter = rewriter
      .on('meta[property="og:image"]', setAttr("content", cert.urls.card))
      .on('meta[name="twitter:image"]', setAttr("content", cert.urls.card))
      .on("head", {
        element(el: Element) {
          el.append(`<script type="application/ld+json">${credentialJsonLd(cert)}</script>`, {
            html: true,
          });
        },
      });
  }

  return rewriter.transform(
    withStatus(shell, revoked ? 410 : 200, revoked ? 60 : 300),
  );
}

function renderError(shell: Response, id: string, revoked: boolean): Response {
  const rewriter = new HTMLRewriter()
    .on("title", setText(notFoundTitle()))
    .on('meta[name="description"]', setAttr("content", errorDescription(id, revoked)))
    .on('script[id="__CERT__"]', setHtml(islandJson({ ok: false, status: 404, id })))
    .on("div[data-cert-slot]", setHtml(errorSlotHtml(id, revoked)));
  return rewriter.transform(withStatus(shell, 404, 60));
}

function withStatus(shell: Response, status: number, sMaxAge: number): Response {
  const headers = new Headers(shell.headers);
  headers.set("cache-control", `public, max-age=0, s-maxage=${sMaxAge}`);
  return new Response(shell.body, { status, headers });
}
