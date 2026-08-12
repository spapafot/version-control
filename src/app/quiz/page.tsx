import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema, quizSchema } from "@/lib/schema";
import { PAGE_SEO } from "@/lib/page-seo";
import { pageMetadata } from "@/lib/seo";
import { QuizClient } from "./QuizClient";

const seo = PAGE_SEO["/quiz/"];

export const metadata = pageMetadata({
  title: seo.title,
  description: seo.description,
  path: "/quiz/",
});

/**
 * The quiz screen is client-only (next/dynamic ssr:false), and unlike the other
 * ssr:false routes this page has NO server-rendered counterpart: the About
 * section that used to supply one was removed deliberately, so the page reaches
 * a crawler as an empty body with no h1.
 *
 * That is a product decision, not an oversight, and scripts/seo-check.mjs
 * exempts /quiz/ from the body-length and single-h1 rules because of it. The
 * cost is that /quiz/ will not rank; the metadata and JSON-LD below still
 * describe the page correctly for anything that follows a direct link.
 */
export default function QuizPage() {
  return (
    <>
      <QuizClient />
      <JsonLd
        data={[
          quizSchema(),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Git quiz", path: "/quiz/" },
          ]),
        ]}
      />
    </>
  );
}
