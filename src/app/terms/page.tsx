import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/layout/LegalPage";
import { PAGE_SEO } from "@/lib/page-seo";
import { pageMetadata } from "@/lib/seo";

const seo = PAGE_SEO["/terms/"];

export const metadata = pageMetadata({
  title: seo.title,
  description: seo.description,
  path: "/terms/",
});

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use" updated="10 August 2026">
      <p className="text-fg">
        VersionControl.gr is a free Git course. Using it means accepting the few
        things below.
      </p>

      <LegalSection heading="The course is free and provided as-is">
        <p>
          You can use the lessons and the playground for personal or professional
          learning at no cost. The material is provided without warranty of any
          kind: it may contain mistakes, it may be unavailable at times, and it
          may change or disappear without notice.
        </p>
        <p>
          The Git engine here is a teaching simulation running in your browser.
          It behaves like real Git for everything the course covers, but it is
          not a substitute for the real thing. Check what a command does before
          running it against work you care about.
        </p>
      </LegalSection>

      <LegalSection heading="Your progress can be lost">
        <p>
          Progress and achievements are stored in your browser. Without an
          account, clearing site data, using private browsing, switching
          browsers or switching devices will lose them, and there is no backup
          on our side. Creating a free account is optional and adds a synced
          copy you can restore from, but syncing is best effort: it only
          captures what has reached our servers.
        </p>
      </LegalSection>

      <LegalSection heading="Accounts and certificates">
        <p>
          Accounts are optional and free. You are responsible for the accuracy
          of the name you put on a certificate: it must be your own name, and it
          is shown publicly on the certificate&apos;s verification page along
          with the issue date and the skills covered.
        </p>
        <p>
          Certificates state that an account completed all course missions. We
          may revoke a certificate if it was obtained by tampering with the
          sync data, carries a misleading or offensive name, or is otherwise
          abused; its verification link then reports it as revoked. If you want
          your own certificate removed, use the contact address in the privacy
          policy.
        </p>
      </LegalSection>

      <LegalSection heading="Liability">
        <p>
          To the extent permitted by law, we are not liable for any loss or
          damage arising from using this site, including lost work or lost
          progress. Nothing here removes rights you have as a consumer under
          Greek or EU law.
        </p>
      </LegalSection>

      <LegalSection heading="Content and trademarks">
        <p>
          The course text, exercises and design belong to their authors. Git is a
          trademark of the Software Freedom Conservancy. This site is an
          independent learning project and is not affiliated with or endorsed by
          the Git project, GitHub or Google.
        </p>
      </LegalSection>

      <LegalSection heading="Fair use">
        <p>
          Please don&apos;t attempt to disrupt the site or use automated tools to
          hammer it. Everything runs in your own browser, so there is little to
          gain from it anyway.
        </p>
      </LegalSection>

      <LegalSection heading="Privacy">
        <p>
          How data is handled is covered separately in the{" "}
          <Link
            prefetch={false}
            href="/privacy/"
            className="text-phos underline underline-offset-2 hover:text-amber"
          >
            privacy and cookies policy
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
