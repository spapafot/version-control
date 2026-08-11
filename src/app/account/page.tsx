import Link from "next/link";
import { ALL_CHALLENGES } from "@/challenges";
import { GameHeader } from "@/components/layout/GameHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { JsonLd } from "@/components/seo/JsonLd";
import { PixelPanel } from "@/components/ui/pixel";
import { breadcrumbSchema } from "@/lib/schema";
import { PAGE_SEO } from "@/lib/page-seo";
import { pageMetadata } from "@/lib/seo";
import { AccountClient } from "./AccountClient";

const seo = PAGE_SEO["/account/"];

export const metadata = pageMetadata({
  title: seo.title,
  description: seo.description,
  path: "/account/",
});

export default function AccountPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-ink">
      <GameHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <AccountClient />
        {/* the dashboard above is client-only, so this is what a crawler reads */}
        <section aria-labelledby="about-certificate" className="pt-8">
          <PixelPanel tone="line" title="▪ About the certificate">
            <div className="flex flex-col gap-4 p-5">
              <h1 id="about-certificate" className="hud glow-text text-xl text-phos">
                Track your progress and earn a Git certificate
              </h1>
              <div className="flex flex-col gap-2.5 text-sm leading-relaxed text-fg">
                <p>
                  You never need an account to take the course. Every mission runs in
                  your browser and your device keeps the progress. An account is what
                  lets you issue your certificate once all {ALL_CHALLENGES.length}{" "}
                  missions are done.
                </p>
                <p>
                  The certificate carries the name you choose, along with the Git skills
                  the course covers. It stays at a permanent public link, so it works on
                  a CV or a LinkedIn profile, and anyone who opens the link can check it
                  on the{" "}
                  <Link prefetch={false} href="/verify/" className="text-phos underline underline-offset-2 hover:text-amber">
                    verification page
                  </Link>{" "}
                  without an account of their own.
                </p>
              </div>
              <nav
                aria-label="Course links"
                className="flex flex-wrap gap-x-4 gap-y-2 border-t border-line pt-4 text-xs"
              >
                <Link prefetch={false} href="/stages/" className="text-amber hover:text-phos">
                  See all {ALL_CHALLENGES.length} missions →
                </Link>
                <Link prefetch={false} href="/verify/" className="text-muted hover:text-phos">
                  Verify a certificate
                </Link>
                <Link prefetch={false} href="/privacy/" className="text-muted hover:text-phos">
                  What an account stores
                </Link>
              </nav>
            </div>
          </PixelPanel>
        </section>
      </main>
      <SiteFooter />
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Account", path: "/account/" },
        ])}
      />
    </div>
  );
}
