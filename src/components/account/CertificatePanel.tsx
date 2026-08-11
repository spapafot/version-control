"use client";

import { useState } from "react";
import { linkedInAddToProfileUrl, verifyUrl, type Certificate } from "@/lib/certificate";
import { HudLabel, PixelButton, PixelPanel } from "@/components/ui/pixel";

/** The issued certificate: permanent link, LinkedIn button, badge downloads. */
export function CertificatePanel({ cert }: { cert: Certificate }) {
  const [copied, setCopied] = useState(false);
  const publicUrl = verifyUrl(cert.credentialId);
  const issued = new Date(cert.issuedOn);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard can be unavailable; the link is visible right below anyway
    }
  }

  return (
    <PixelPanel tone="amber" title="▪ Your certificate" titleAs="h2">
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="font-mono text-lg text-amber">{cert.credentialId}</span>
          <HudLabel tone="line">
            Issued {issued.toISOString().slice(0, 10)} to {cert.recipientName}
          </HudLabel>
        </div>

        <p className="text-sm leading-relaxed text-fg">
          The permanent public record lives at{" "}
          {/* plain <a>: per-certificate pages are served by the edge worker,
              not the Next router, so client-side navigation cannot reach them */}
          <a href={publicUrl} className="break-all text-phos underline underline-offset-2 hover:text-amber">
            {publicUrl}
          </a>
          . Anyone with the link can open it; they don&apos;t need an account.
        </p>

        <div className="flex flex-wrap gap-2">
          <a href={linkedInAddToProfileUrl(cert)} target="_blank" rel="noopener noreferrer">
            <PixelButton tone="phos" type="button">
              Add to LinkedIn profile
            </PixelButton>
          </a>
          <PixelButton tone="line" variant="ghost" type="button" onClick={copyLink}>
            {copied ? "Copied" : "Copy verify link"}
          </PixelButton>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-line pt-4 text-xs">
          <a href={cert.urls.card} className="text-muted hover:text-phos">
            Certificate image (PNG)
          </a>
          <a href={cert.urls.badge} className="text-muted hover:text-phos">
            Open Badge (baked PNG)
          </a>
          <a href={cert.urls.credential} className="text-muted hover:text-phos">
            Credential (JSON)
          </a>
        </div>
      </div>
    </PixelPanel>
  );
}
