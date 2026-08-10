import type { Metadata } from "next";
import { ALL_CHALLENGES, challengeBySlug, challengeNumber } from "@/challenges";
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
  if (!challenge) return { title: "Mission" };
  return {
    title: `Mission ${String(challengeNumber(slug)).padStart(2, "0")}: ${challenge.title}`,
    description: challenge.mission,
  };
}

export default async function ChallengePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ChallengeClient slug={slug} />;
}
