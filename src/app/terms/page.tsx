import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/layout/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "The terms you use the free VersionControl.gr Git course under.",
};

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
          Progress and achievements are stored only in your browser. Clearing
          site data, using private browsing, switching browsers or switching
          devices will lose them. There is no account to restore from and no
          backup on our side.
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
