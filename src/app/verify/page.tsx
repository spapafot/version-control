import { GameHeader } from "@/components/layout/GameHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { JsonLd } from "@/components/seo/JsonLd";
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
          VersionControl.gr certificate
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
