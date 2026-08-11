import { ALL_CHALLENGES } from "@/challenges";
import { CHALLENGE_SEO } from "@/challenges/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { LevelMap } from "@/components/course/LevelMap";
import { breadcrumbSchema, itemListSchema } from "@/lib/schema";
import { PAGE_SEO } from "@/lib/page-seo";
import { pageMetadata } from "@/lib/seo";

const seo = PAGE_SEO["/stages/"];

export const metadata = pageMetadata({
  title: seo.title,
  description: seo.description,
  path: "/stages/",
});

export default function StagesPage() {
  return (
    <>
      <LevelMap />
      <JsonLd
        data={[
          // the full mission list, so this page also works as a crawl hub
          itemListSchema({
            name: "Git course missions",
            items: ALL_CHALLENGES.map((c) => ({
              name: CHALLENGE_SEO[c.id].title,
              path: `/challenge/${c.id}/`,
            })),
          }),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "All missions", path: "/stages/" },
          ]),
        ]}
      />
    </>
  );
}
