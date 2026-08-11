import type { Metadata } from "next";

export const SITE = {
  /** apex host; every canonical points here so the www custom domain consolidates into it */
  url: "https://versioncontrol.gr",
  name: "VersionControl.gr",
  tagline: "Learn Git, using Git",
  author: "Stratos Papafotiou",
  publisher: "Markware",
  locale: "en_US",
} as const;

/**
 * The generated social card (src/app/opengraph-image.tsx).
 *
 * Referenced explicitly rather than relying on the file convention: once a page
 * exports its own `openGraph` object, Next stops folding the inherited image in,
 * which silently left every page except the home page without a card.
 *
 * The file lands in out/ with no extension, so public/_headers supplies its
 * Content-Type.
 */
export const OG_IMAGE = {
  url: `${SITE.url}/opengraph-image`,
  width: 1200,
  height: 630,
  alt: "VersionControl.gr, a free interactive Git course",
} as const;

/**
 * Absolute canonical URL for a route.
 * `trailingSlash: true` in next.config.ts means every emitted path ends in "/",
 * so canonicals have to match or they point at a redirect.
 */
export function canonical(path = "/"): string {
  const clean = `/${path.replace(/^\/+|\/+$/g, "")}`;
  return clean === "/" ? `${SITE.url}/` : `${SITE.url}${clean}/`;
}

/** SERP snippets get cut around 160 chars; backticks and newlines render literally. */
export function snippet(text: string): string {
  return text
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * One builder for every page so canonical/OG/Twitter can't drift apart.
 * The OG image is inherited from the root opengraph-image route via metadataBase.
 */
export function pageMetadata({
  title,
  description,
  path,
  noindex = false,
}: {
  title: string;
  description: string;
  path: string;
  noindex?: boolean;
}): Metadata {
  const url = canonical(path);
  const desc = snippet(description);
  return {
    title,
    description: desc,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: desc,
      url,
      siteName: SITE.name,
      locale: SITE.locale,
      type: "website",
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: desc,
      images: [OG_IMAGE.url],
    },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
  };
}
