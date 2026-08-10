import type { MetadataRoute } from "next";
import { ALL_CHALLENGES } from "@/challenges";

export const dynamic = "force-static";

const BASE = "https://versioncontrol.gr";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE}/`, priority: 1 },
    { url: `${BASE}/stages/`, priority: 0.9 },
    { url: `${BASE}/playground/`, priority: 0.6 },
    ...ALL_CHALLENGES.map((c) => ({
      url: `${BASE}/challenge/${c.id}/`,
      priority: 0.7,
    })),
    { url: `${BASE}/privacy/`, priority: 0.3 },
    { url: `${BASE}/terms/`, priority: 0.3 },
  ];
}
