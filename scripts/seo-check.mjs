/**
 * Validates the built static export in out/.
 *
 * Most of this repo's SEO lives in metadata that no unit test can see, and the
 * expensive failure mode is silent: a page that stops emitting a canonical, or
 * a route whose body goes empty again because something moved back behind a
 * client boundary. This walks the real HTML and fails loudly instead.
 *
 * Run: pnpm seo:check   (after pnpm build)
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

const OUT = "out";
const BASE = "https://versioncontrol.gr";
const DESC_MIN = 70;
const DESC_MAX = 160;
const TITLE_MAX = 65;
/** below this many chars of body text, a page has nothing to rank */
const BODY_MIN = 250;

if (!existsSync(OUT)) {
  console.error(`${OUT}/ not found. Run pnpm build first.`);
  process.exit(1);
}

const problems = [];
const notes = [];
let checked = 0;

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else if (name.endsWith(".html")) files.push(full);
  }
  return files;
}

const decode = (s) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x2F;/g, "/");

const attr = (html, re) => {
  const m = html.match(re);
  return m ? decode(m[1]) : null;
};

/** file path in out/ -> the canonical URL it should carry */
function expectedCanonical(file) {
  const rel = relative(OUT, file).split(sep).join("/");
  if (rel === "index.html") return `${BASE}/`;
  return `${BASE}/${rel.replace(/\/index\.html$/, "")}/`;
}

function bodyText(html) {
  const body = html.slice(html.indexOf("<body"));
  return body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

for (const file of walk(OUT)) {
  const rel = relative(OUT, file).split(sep).join("/");
  const html = readFileSync(file, "utf8");
  const fail = (msg) => problems.push(`${rel}: ${msg}`);

  const noindex = /<meta name="robots"[^>]*content="[^"]*noindex/i.test(html);
  // Next emits the 404 body at both /404.html and /_not-found/
  const is404 = rel === "404.html" || rel.startsWith("_not-found/");
  // Pages that deliberately ship no server-rendered content. Every other
  // ssr:false route pairs its client boundary with a server-rendered sibling
  // (MissionBrief, the playground About section) precisely so this check can
  // stay on; /quiz/ dropped its sibling on purpose, so it has no h1 and an
  // empty body and will not rank. Do NOT add to this list to silence a
  // failure: an empty body is almost always a client boundary with no
  // counterpart, which is a bug, not a decision.
  const bodyless = rel === "quiz/index.html";
  checked++;

  // ── title ──────────────────────────────────────────────────────────────
  const title = attr(html, /<title>([^<]*)<\/title>/);
  if (!title) fail("no <title>");
  else if (title.length > TITLE_MAX)
    fail(`title is ${title.length} chars (max ${TITLE_MAX}): ${title}`);

  // ── description ────────────────────────────────────────────────────────
  const desc = attr(html, /<meta name="description" content="([^"]*)"/);
  if (!desc && !is404) fail("no meta description");
  if (desc) {
    if (desc.length < DESC_MIN)
      fail(`description is ${desc.length} chars (min ${DESC_MIN})`);
    if (desc.length > DESC_MAX)
      fail(`description is ${desc.length} chars (max ${DESC_MAX})`);
    if (desc.includes("`"))
      fail(
        "description contains a backtick, which renders literally in a snippet",
      );
    if (/[-–]/.test(desc)) fail("description contains an em or en dash");
  }

  // ── canonical ──────────────────────────────────────────────────────────
  if (!noindex) {
    const canonical = attr(html, /<link rel="canonical" href="([^"]*)"/);
    const want = expectedCanonical(file);
    if (!canonical) fail("no canonical link");
    else if (canonical !== want)
      fail(`canonical is ${canonical}, expected ${want}`);
  }

  // ── social ─────────────────────────────────────────────────────────────
  if (!is404) {
    if (!/<meta property="og:image"/.test(html)) fail("no og:image");
    if (!/<meta property="og:url"/.test(html)) fail("no og:url");
    const card = attr(html, /<meta name="twitter:card" content="([^"]*)"/);
    if (card !== "summary_large_image")
      fail(`twitter:card is ${card ?? "missing"}`);
  }

  // ── headings ───────────────────────────────────────────────────────────
  const h1s = html.match(/<h1[\s>]/g) ?? [];
  const wantH1 = bodyless ? 0 : 1;
  if (h1s.length !== wantH1)
    fail(`has ${h1s.length} h1 elements, expected exactly ${wantH1}`);

  // ── real content ───────────────────────────────────────────────────────
  const text = bodyText(html);
  if (!is404 && !bodyless && text.length < BODY_MIN) {
    fail(
      `only ${text.length} chars of body text (min ${BODY_MIN}); is it behind a client boundary?`,
    );
  }

  // ── structured data ────────────────────────────────────────────────────
  const blocks = [
    ...html.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    ),
  ];
  if (blocks.length === 0 && !is404) fail("no JSON-LD");
  for (const [i, block] of blocks.entries()) {
    let parsed;
    try {
      parsed = JSON.parse(block[1].replace(/\\u003c/g, "<"));
    } catch (err) {
      fail(`JSON-LD block ${i} does not parse: ${err.message}`);
      continue;
    }
    for (const node of [parsed].flat()) {
      if (!node || !node["@type"])
        fail(`JSON-LD block ${i} has a node with no @type`);
      if (node && !node["@context"])
        fail(`JSON-LD block ${i} has a node with no @context`);
    }
  }
}

// ── sitemap, robots and the social image ─────────────────────────────────
const sitemapPath = join(OUT, "sitemap.xml");
if (!existsSync(sitemapPath)) problems.push("sitemap.xml: missing");
else {
  const sitemap = readFileSync(sitemapPath, "utf8");
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  notes.push(`sitemap lists ${urls.length} URLs`);
  for (const url of urls) {
    const path = url.replace(BASE, "").replace(/^\/|\/$/g, "");
    const target =
      path === "" ? join(OUT, "index.html") : join(OUT, path, "index.html");
    if (!existsSync(target))
      problems.push(`sitemap.xml: ${url} has no page at ${target}`);
    if (!url.endsWith("/"))
      problems.push(`sitemap.xml: ${url} has no trailing slash`);
  }
  // anything indexable that the sitemap forgot
  for (const file of walk(OUT)) {
    const rel = relative(OUT, file).split(sep).join("/");
    if (rel === "404.html" || rel.startsWith("_not-found/")) continue;
    const html = readFileSync(file, "utf8");
    if (/<meta name="robots"[^>]*content="[^"]*noindex/i.test(html)) continue;
    if (!urls.includes(expectedCanonical(file))) {
      problems.push(`sitemap.xml: missing ${expectedCanonical(file)}`);
    }
  }
}

if (!existsSync(join(OUT, "robots.txt"))) problems.push("robots.txt: missing");

const ogPath = join(OUT, "opengraph-image");
if (!existsSync(ogPath)) {
  problems.push("opengraph-image: not generated");
} else {
  const magic = readFileSync(ogPath).subarray(1, 4).toString("ascii");
  if (magic !== "PNG") problems.push("opengraph-image: not a PNG");
  // extensionless, so nothing infers its type; _headers has to supply it
  const headers = existsSync(join(OUT, "_headers"))
    ? readFileSync(join(OUT, "_headers"), "utf8")
    : "";
  if (!/\/opengraph-image[\s\S]*Content-Type:\s*image\/png/.test(headers)) {
    problems.push(
      "_headers: no Content-Type: image/png rule for /opengraph-image",
    );
  }
}

// ── report ───────────────────────────────────────────────────────────────
for (const note of notes) console.log(`  ${note}`);
console.log(`  checked ${checked} HTML pages`);

if (problems.length) {
  console.error(`\n${problems.length} SEO problem(s):\n`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log("\n✓ SEO checks passed");
