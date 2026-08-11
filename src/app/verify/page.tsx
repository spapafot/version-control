import Link from "next/link";
import { ALL_CHALLENGES, SECTIONS } from "@/challenges";
import { GameHeader } from "@/components/layout/GameHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { JsonLd } from "@/components/seo/JsonLd";
import { PixelPanel } from "@/components/ui/pixel";
import { breadcrumbSchema } from "@/lib/schema";
import { PAGE_SEO } from "@/lib/page-seo";
import { pageMetadata } from "@/lib/seo";
import { VerifyClient } from "./VerifyClient";

const seo = PAGE_SEO["/verify/"];

export const metadata = pageMetadata({
  title: seo.title,
  description: seo.description,
  path: "/verify/",
});

/**
 * One static page, two roles. Served as-is at /verify/, and re-served by the
 * edge worker for every /verify/{credentialId}/ URL, which rewrites the head
 * metadata, fills the #__CERT__ data island and the [data-cert-slot] element.
 * The worker only ever REWRITES nodes that already exist here, so their
 * presence (even empty) is load-bearing.
 */
export default function VerifyPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-ink">
      <div className="print-hidden">
        <GameHeader />
      </div>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="hud glow-text print-hidden text-xl text-phos">
          Verify a VersionControl.gr certificate
        </h1>

        {/* filled by the edge worker with the verification payload */}
        <script
          type="application/json"
          id="__CERT__"
          dangerouslySetInnerHTML={{ __html: "null" }}
        />
        {/* crawler-visible summary injected by the worker; the client screen
            replaces it with the full certificate view */}
        <div data-cert-slot className="pt-6 text-sm leading-relaxed text-fg" />

        <VerifyClient />

        <section aria-labelledby="about-verification" className="print-hidden pt-10">
          <PixelPanel tone="line" title="▪ How verification works">
            <div className="flex flex-col gap-2.5 p-5 text-sm leading-relaxed text-fg">
              <h2 id="about-verification" className="sr-only">
                How verification works
              </h2>
              <p>
                Every certificate issued by VersionControl.gr has a credential ID that
                looks like{" "}
                <code className="bg-raised px-1 py-0.5 font-mono text-amber">
                  VC-GIT-F-7K4M9P2X
                </code>{" "}
                and a permanent public page at{" "}
                <code className="bg-raised px-1 py-0.5 font-mono text-amber">
                  versioncontrol.gr/verify/&lt;ID&gt;
                </code>
                . If someone hands you a certificate, open that address or paste the ID
                above to see who earned it, when it was issued and which skills it covers.
              </p>
              <p>
                A certificate is only issued after an account completes all{" "}
                {ALL_CHALLENGES.length} hands-on missions across the course&apos;s{" "}
                {SECTIONS.length} topics, first commit to history repair. Each one doubles
                as an Open Badges 3.0 credential, signed with the key this site publishes,
                so badge wallets and other tools can check it without trusting this page.
              </p>
              <p>
                Want one with your name on it? The course is free:{" "}
                <Link
                  prefetch={false}
                  href="/stages/"
                  className="text-phos underline underline-offset-2 hover:text-amber"
                >
                  start with the missions
                </Link>{" "}
                and{" "}
                <Link
                  prefetch={false}
                  href="/account/"
                  className="text-phos underline underline-offset-2 hover:text-amber"
                >
                  claim the certificate
                </Link>{" "}
                when you finish.
              </p>
            </div>
          </PixelPanel>
        </section>
      </main>
      <div className="print-hidden">
        <SiteFooter />
      </div>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Verify", path: "/verify/" },
        ])}
      />
    </div>
  );
}
