import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ALL_CHALLENGES, challengeBySlug, challengeNumber, sectionOf } from "@/challenges";
import { CHALLENGE_SEO } from "@/challenges/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { MissionBrief } from "@/components/challenge/MissionBrief";
import { NotesDialog } from "@/components/challenge/NotesDialog";
import { breadcrumbSchema, missionSchema } from "@/lib/schema";
import { OG_IMAGE, SITE, canonical, snippet } from "@/lib/seo";
import { ChallengeClient } from "./ChallengeClient";

export function generateStaticParams() {
  return ALL_CHALLENGES.map((c) => ({ slug: c.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const challenge = challengeBySlug.get(slug);
  const seo = CHALLENGE_SEO[slug];
  if (!challenge || !seo) return { title: "Mission not found", robots: { index: false } };

  const url = canonical(`challenge/${slug}`);
  const description = snippet(seo.description);
  return {
    // absolute: mission pages skip the site-name suffix so the whole SERP
    // title budget goes to the keyword
    title: { absolute: seo.title },
    description,
    alternates: { canonical: url },
    openGraph: {
      title: seo.title,
      description,
      url,
      siteName: SITE.name,
      locale: SITE.locale,
      type: "article",
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description,
      images: [OG_IMAGE.url],
    },
  };
}

export default async function ChallengePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const challenge = challengeBySlug.get(slug);
  if (!challenge) notFound();

  const section = sectionOf(slug);
  return (
    <>
      <ChallengeClient slug={slug} />
      {/* static, crawlable counterpart to the client-only screen above; the
          dialog keeps it in the HTML but off the screen until asked for, so
          the game itself fits one viewport */}
      <NotesDialog label={`Lesson notes for ${challenge.title}`}>
        <MissionBrief challenge={challenge} />
      </NotesDialog>
      <JsonLd
        data={[
          missionSchema(challenge),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "All missions", path: "/stages/" },
            {
              name: `Mission ${challengeNumber(slug)}: ${section?.title ?? "Mission"}`,
              path: `/challenge/${slug}/`,
            },
          ]),
        ]}
      />
    </>
  );
}
