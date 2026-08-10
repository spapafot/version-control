"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useConsent, useConsentHydrated } from "@/lib/consent";

const GA_MEASUREMENT_ID = "G-GZDXV866QK";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Loads gtag.js only after the visitor opts in. Until then nothing from Google
 * is in the DOM and no request is made, which is what "strict opt-in" means
 * under GDPR/ePrivacy.
 */
export function GoogleAnalytics() {
  const analytics = useConsent((s) => s.analytics);
  const hydrated = useConsentHydrated();
  const granted = hydrated && analytics === "granted";
  const pathname = usePathname();

  // gtag's own page_view is switched off below, so every view is sent from here:
  // once on load and once per client-side route change, with no double count.
  useEffect(() => {
    if (!granted || !window.gtag) return;
    window.gtag("event", "page_view", { page_path: pathname });
  }, [granted, pathname]);

  if (!granted) return null;

  return (
    <>
      <Script
        id="ga-src"
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
gtag('js', new Date());
gtag('config', '${GA_MEASUREMENT_ID}', { send_page_view: false });`}
      </Script>
    </>
  );
}
