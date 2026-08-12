import { ALL_CHALLENGES, SECTIONS, challengeNumber, type ChallengeDefinition } from "@/challenges";
import { CHALLENGE_SEO } from "@/challenges/seo";
import { SITE, canonical, snippet } from "./seo";

/**
 * JSON-LD builders. Stable @id values let the graph cross-reference itself
 * (a mission points at the Course, the Course points at the Organization)
 * instead of repeating the same entity on every page.
 */
const ORG_ID = `${SITE.url}/#organization`;
const SITE_ID = `${SITE.url}/#website`;
const COURSE_ID = `${SITE.url}/#course`;

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE.publisher,
    url: `${SITE.url}/`,
    logo: {
      "@type": "ImageObject",
      url: `${SITE.url}/icon.svg`,
    },
    founder: { "@type": "Person", name: SITE.author },
  };
}

export function webSiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": SITE_ID,
    name: SITE.name,
    alternateName: SITE.tagline,
    url: `${SITE.url}/`,
    inLanguage: "en",
    publisher: { "@id": ORG_ID },
    // no SearchAction: the site has no search, and claiming one would be false
  };
}

export function courseSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    "@id": COURSE_ID,
    name: "VersionControl.gr: an interactive Git course",
    description: snippet(
      "A free Git course you work through by running real Git commands in a browser terminal. " +
        `${ALL_CHALLENGES.length} missions across ${SECTIONS.length} topics, from the first commit to merge conflicts and remotes.`,
    ),
    url: `${SITE.url}/`,
    inLanguage: "en",
    isAccessibleForFree: true,
    educationalLevel: "Beginner to intermediate",
    provider: { "@id": ORG_ID },
    isPartOf: { "@id": SITE_ID },
    teaches: SECTIONS.map((s) => s.title),
    // courseWorkload is deliberately absent: no measured completion time exists,
    // and guessing one would put a fabricated figure into structured data.
    hasCourseInstance: {
      "@type": "CourseInstance",
      courseMode: "online",
      inLanguage: "en",
    },
    syllabusSections: SECTIONS.map((s) => ({
      "@type": "Syllabus",
      name: s.title,
      description: s.blurb,
      position: s.world,
    })),
  };
}

export function missionSchema(challenge: ChallengeDefinition) {
  const seo = CHALLENGE_SEO[challenge.id];
  const section = SECTIONS.find((s) => s.id === challenge.section);
  return {
    "@context": "https://schema.org",
    "@type": "LearningResource",
    "@id": `${canonical(`challenge/${challenge.id}`)}#lesson`,
    name: seo.title,
    description: snippet(seo.description),
    url: canonical(`challenge/${challenge.id}`),
    learningResourceType: "Exercise",
    educationalUse: "Practice",
    inLanguage: "en",
    isAccessibleForFree: true,
    teaches: seo.teaches,
    position: challengeNumber(challenge.id),
    isPartOf: { "@id": COURSE_ID },
    about: section
      ? { "@type": "Thing", name: section.title, description: section.blurb }
      : undefined,
    provider: { "@id": ORG_ID },
  };
}

export function webApplicationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Git Playground",
    description: snippet(
      "A Git sandbox that runs in the browser. Start an empty repository, run real commands, and watch the commit graph redraw.",
    ),
    url: canonical("playground"),
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Any browser",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
    publisher: { "@id": ORG_ID },
  };
}

export function quizSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Quiz",
    "@id": `${canonical("quiz")}#quiz`,
    name: "Git quiz: timed multiple choice questions",
    description: snippet(
      "Timed multiple-choice questions on everyday Git: what a command does, and which command a given situation calls for. Sprint against the clock or take a set of twenty.",
    ),
    url: canonical("quiz"),
    learningResourceType: "Quiz",
    educationalUse: "Assessment",
    inLanguage: "en",
    isAccessibleForFree: true,
    educationalLevel: "Beginner to intermediate",
    about: SECTIONS.map((s) => ({ "@type": "Thing", name: s.title })),
    isPartOf: { "@id": COURSE_ID },
    provider: { "@id": ORG_ID },
    // No hasPart questions and no FAQPage: the questions are drawn per run and
    // are not on the page, and marking up Q&A a visitor cannot see is what earns
    // a manual action. numberOfQuestions is left out too, because the bank lives
    // in DynamoDB and any number here would drift out of date.
  };
}

export function techArticleSchema({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: title,
    description: snippet(description),
    url: canonical(path),
    inLanguage: "en",
    isAccessibleForFree: true,
    author: { "@type": "Person", name: SITE.author },
    publisher: { "@id": ORG_ID },
    isPartOf: { "@id": SITE_ID },
  };
}

export function breadcrumbSchema(trail: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((step, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: step.name,
      item: canonical(step.path),
    })),
  };
}

export function itemListSchema({
  name,
  items,
}: {
  name: string;
  items: { name: string; path: string }[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: items.length,
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      url: canonical(item.path),
    })),
  };
}
