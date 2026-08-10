import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/layout/LegalPage";

export const metadata: Metadata = {
  title: "Privacy & Cookies",
  description:
    "What VersionControl.gr stores, what it doesn't, and how analytics consent works.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy & Cookies" updated="10 August 2026">
      <p className="text-fg">
        VersionControl.gr is a free Git course with no accounts, no payments and
        no sign-up. The short version: your work stays on your own machine, and
        the only thing that ever leaves it is anonymous visit counting, which
        only happens if you agree to it.
      </p>

      <LegalSection heading="Who is responsible">
        <p>
          The data controller for this site is Stratos Papafotiou / Markware. For
          anything on this page, write to{" "}
          <a
            href="mailto:info@markware.gr"
            className="text-phos underline underline-offset-2 hover:text-amber"
          >
            info@markware.gr
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection heading="What stays in your browser">
        <p>
          The Git engine runs entirely inside your browser on an in-memory
          filesystem. Repositories you create, files you edit and commands you
          type are never uploaded, and there is no server here that could
          receive them.
        </p>
        <p>
          Your progress, achievements and the sound and CRT toggles are saved in
          your browser&apos;s local storage under{" "}
          <code className="bg-raised px-1 font-mono text-[0.92em] text-amber">
            versioncontrol-progress
          </code>
          . Your analytics choice is saved under{" "}
          <code className="bg-raised px-1 font-mono text-[0.92em] text-amber">
            versioncontrol-consent
          </code>
          . Both live on your device only. Clearing your browser&apos;s site data
          for versioncontrol.gr deletes them, and also resets your course
          progress.
        </p>
      </LegalSection>

      <LegalSection heading="Analytics">
        <p>
          If you accept, the site loads Google Analytics (measurement ID{" "}
          <code className="bg-raised px-1 font-mono text-[0.92em] text-amber">
            G-GZDXV866QK
          </code>
          ) to count visits and see which lessons people reach. Google sets
          cookies in your browser and receives your IP address, approximate
          location, device and browser details, and the pages you open. That data
          is processed by Google under its own terms.
        </p>
        <p>
          If you decline, the Google script is never added to the page and no
          request to Google is made. Nothing is loaded before you answer, so
          simply ignoring the banner is the same as declining until you choose.
        </p>
        <p>
          You can change your mind at any time with the{" "}
          <span className="text-phos">Cookie settings</span> link at the bottom of
          this page. It brings the banner back so you can answer again.
        </p>
      </LegalSection>

      <LegalSection heading="Hosting">
        <p>
          The site is served as static files by Cloudflare. Like any web host,
          Cloudflare processes connection data such as your IP address in order
          to deliver the page and to protect against abuse.
        </p>
      </LegalSection>

      <LegalSection heading="What we never collect">
        <p>
          No accounts, no passwords, no email addresses, no payment details, no
          contact forms. There are no advertising trackers, social media embeds
          or third-party fonts loaded from other servers.
        </p>
      </LegalSection>

      <LegalSection heading="Your rights">
        <p>
          Under the GDPR you can ask for access to, correction of, or erasure of
          personal data held about you, and you can object to processing or
          withdraw consent. Since the only personal data involved here is
          collected by Google Analytics after you opt in, withdrawing consent and
          clearing your browser data covers most of it. For anything else, use
          the contact address above. You also have the right to complain to your
          national data protection authority.
        </p>
      </LegalSection>

      <LegalSection heading="Changes">
        <p>
          If this page changes, the date at the top changes with it. See also the{" "}
          <Link
            prefetch={false}
            href="/terms/"
            className="text-phos underline underline-offset-2 hover:text-amber"
          >
            terms of use
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
