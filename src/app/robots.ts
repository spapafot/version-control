import type { MetadataRoute } from "next";
import { canonical } from "@/lib/seo";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${canonical("/")}sitemap.xml`,
    // states the preferred hostname for crawlers that honour it; the apex and
    // www are both live custom domains and canonicals all point here
    host: canonical("/"),
  };
}
