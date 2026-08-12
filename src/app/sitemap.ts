import type { MetadataRoute } from "next";
import { ALL_CHALLENGES } from "@/challenges";
import { canonical } from "@/lib/seo";

export const dynamic = "force-static";

/**
 * Build date, used for lastModified. A static export has no notion of when a
 * given page's content last changed, so every URL shares the build timestamp;
 * that is honest for a site deployed as one atomic bundle.
 */
const lastModified = new Date();

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: canonical("/"), lastModified, changeFrequency: "monthly", priority: 1 },
    { url: canonical("stages"), lastModified, changeFrequency: "monthly", priority: 0.9 },
    { url: canonical("cheatsheet"), lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: canonical("quiz"), lastModified, changeFrequency: "monthly", priority: 0.8 },
    ...ALL_CHALLENGES.map((c) => ({
      url: canonical(`challenge/${c.id}`),
      lastModified,
      changeFrequency: "yearly" as const,
      priority: 0.7,
    })),
    { url: canonical("playground"), lastModified, changeFrequency: "yearly", priority: 0.6 },
    { url: canonical("account"), lastModified, changeFrequency: "yearly", priority: 0.5 },
    { url: canonical("verify"), lastModified, changeFrequency: "yearly", priority: 0.5 },
    { url: canonical("privacy"), lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: canonical("terms"), lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];
}
