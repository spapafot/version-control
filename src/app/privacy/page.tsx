import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/layout/LegalPage";
import { PAGE_SEO } from "@/lib/page-seo";
import { pageMetadata } from "@/lib/seo";

const seo = PAGE_SEO["/privacy/"];

export const metadata = pageMetadata({
  title: seo.title,
  description: seo.description,
  path: "/privacy/",
});

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy & Cookies" updated="10 August 2026">
      <p className="text-fg">
        VersionControl.gr is a free Git course with no payments and no required
        sign-up. The short version: your work stays on your own machine unless
        you choose to create an account, and nothing else leaves it except
        anonymous visit counting, which only happens if you agree to it.
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
          . Your best quiz results for this browser are saved under{" "}
          <code className="bg-raised px-1 font-mono text-[0.92em] text-amber">
            versioncontrol-quiz
          </code>
          . All three live on your device only. Clearing your browser&apos;s site
          data for versioncontrol.gr deletes them, and also resets your course
          progress on this device (an account, if you have one, keeps a copy —
          see the next section).
        </p>
      </LegalSection>

      <LegalSection heading="Accounts, sync and certificates">
        <p>
          Accounts are optional. The whole course works without one; an account
          only adds progress sync and the certificate. If you create one, your
          email address and password are handled by Amazon Web Services
          (Cognito), acting as our processor, and we store your email, your
          course progress (which missions you completed and when, hint counts,
          achievements), and, if you set them, the display name for your
          certificate and the nickname for the quiz leaderboards. Those two are
          separate: the certificate name is not published on any leaderboard, and
          the nickname is not printed on any certificate. We never receive or
          store the contents of your practice repositories or the commands you
          type.
        </p>
        <p>
          Signing in never deletes local progress: what is in your browser and
          what your account has seen from other devices are merged, and the
          earliest completion for each mission is the one that counts. Signing
          out leaves the progress in your browser untouched.
        </p>
        <p>
          Certificates are public by design. The verification page for a
          certificate shows the display name you chose, the issue date, the
          credential ID and the skills covered, to anyone who has the link. The
          machine-readable Open Badges credential identifies you only by a
          salted hash of your email address, never the address itself. Your
          email is never shown publicly.
        </p>
        <p>
          The quiz leaderboards are public. You can take the quiz without an
          account and nothing is stored on our side; a score only reaches a
          leaderboard if you are signed in and have set a nickname, and what
          appears there is that nickname, the score and the time taken. The name
          on your certificate is never shown on a leaderboard, and your email is
          never shown anywhere. If you would rather not appear at all, play
          without signing in, or simply do not set a nickname. For signed-in
          players we also keep a running count of quiz attempts and correct
          answers alongside your best result for each mode.
        </p>
        <p>
          To delete your account and its data, including your quiz results and
          any leaderboard entries, or to revoke a certificate, write to the
          contact address above.
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
          No payment details and no contact forms. Unless you create an
          account, no email addresses or passwords either. There are no
          advertising trackers, social media embeds or third-party fonts loaded
          from other servers, with or without an account.
        </p>
      </LegalSection>

      <LegalSection heading="Your rights">
        <p>
          Under the GDPR you can ask for access to, correction of, or erasure of
          personal data held about you, and you can object to processing or
          withdraw consent. Without an account, the only personal data involved
          is collected by Google Analytics after you opt in, so withdrawing
          consent and clearing your browser data covers most of it. With an
          account, erasure means deleting your profile, progress and, if you
          ask for it, your certificate (its verification link then stops
          working). For any of this, use the contact address above. You also
          have the right to complain to your national data protection
          authority.
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
