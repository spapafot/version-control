"use client";

import { useEffect, useState, type FormEvent } from "react";
import { API_BASE } from "@/lib/auth-config";
import {
  CREDENTIAL_ID_PATTERN,
  type CertIsland,
  type VerifyPayload,
} from "@/lib/certificate";
import {
  HudLabel,
  PixelButton,
  PixelField,
  PixelInput,
  PixelPanel,
} from "@/components/ui/pixel";

type ViewState =
  | { kind: "pending" }
  | { kind: "bare" }
  | { kind: "cert"; cert: VerifyPayload }
  | { kind: "missing"; id: string }
  | { kind: "revoked-stub"; id: string }
  | { kind: "unreachable"; id: string };

const PATH_RE = /^\/verify\/(VC-GIT-F-[0-9A-HJKMNP-TV-Z]{8})\/?$/i;

export function VerifyScreen() {
  const [view, setView] = useState<ViewState>({ kind: "pending" });

  useEffect(() => {
    let island: CertIsland = null;
    try {
      island = JSON.parse(document.getElementById("__CERT__")?.textContent ?? "null");
    } catch {
      island = null;
    }
    if (island) {
      removeCrawlerSlot();
      if (island.ok) setView({ kind: "cert", cert: island.cert });
      else if (island.status === 410) setView({ kind: "revoked-stub", id: island.id });
      else setView({ kind: "missing", id: island.id });
      return;
    }

    // No island: either the bare /verify/ page, or a /verify/{id}/ served
    // without the edge worker (next dev, serve-out.mjs) — fetch directly.
    const match = window.location.pathname.match(PATH_RE);
    if (!match) {
      setView({ kind: "bare" });
      return;
    }
    const id = match[1].toUpperCase();
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/v1/verify/${id}`);
        if (cancelled) return;
        if (res.ok) {
          const cert = (await res.json()) as VerifyPayload;
          removeCrawlerSlot();
          setView({ kind: "cert", cert });
        } else {
          setView({ kind: "missing", id });
        }
      } catch (err) {
        console.warn("[verify]", err);
        if (!cancelled) setView({ kind: "unreachable", id });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  switch (view.kind) {
    case "pending":
      return (
        <div className="flex min-h-24 items-center justify-center">
          <HudLabel cursor tone="phos">
            Checking credential
          </HudLabel>
        </div>
      );
    case "bare":
      return <IdLookupForm />;
    case "cert":
      return <CertificateView cert={view.cert} />;
    case "missing":
      return (
        <StatusPanel tone="red" heading="Certificate not found">
          No certificate with the ID{" "}
          <span className="font-mono text-amber">{view.id}</span> exists. Check the ID for
          typos; the characters I, L, O and U are never used.
        </StatusPanel>
      );
    case "revoked-stub":
      return (
        <StatusPanel tone="red" heading="Certificate revoked">
          The certificate <span className="font-mono text-amber">{view.id}</span> existed
          but has been revoked and is no longer valid.
        </StatusPanel>
      );
    case "unreachable":
      return (
        <StatusPanel tone="amber" heading="Could not check right now">
          The verification service is unreachable. The credential{" "}
          <span className="font-mono text-amber">{view.id}</span> could not be checked;
          try again in a moment.
        </StatusPanel>
      );
  }
}

function removeCrawlerSlot() {
  document.querySelector("[data-cert-slot]")?.remove();
}

function IdLookupForm() {
  const [id, setId] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const clean = id.trim().toUpperCase();
    if (!CREDENTIAL_ID_PATTERN.test(clean)) {
      setError("That does not look like a credential ID (expected VC-GIT-F- plus 8 characters).");
      return;
    }
    // Full navigation on purpose: per-certificate pages exist only at the edge
    // worker, so the client-side router can never reach them.
    window.location.href = `/verify/${clean}/`;
  }

  return (
    <div className="pt-6">
      <PixelPanel tone="phos" title="▪ Check a credential" titleAs="h2">
        <form onSubmit={onSubmit} className="flex flex-col gap-4 p-5" noValidate>
          <PixelField label="Credential ID" htmlFor="verify-id" error={error}>
            <div className="flex flex-wrap items-center gap-2">
              <PixelInput
                id="verify-id"
                placeholder="VC-GIT-F-XXXXXXXX"
                autoComplete="off"
                spellCheck={false}
                value={id}
                onChange={(e) => {
                  setId(e.target.value);
                  setError(null);
                }}
                className="min-w-56 flex-1 uppercase"
              />
              <PixelButton type="submit" tone="phos">
                Verify
              </PixelButton>
            </div>
          </PixelField>
        </form>
      </PixelPanel>
    </div>
  );
}

function StatusPanel({
  tone,
  heading,
  children,
}: {
  tone: "red" | "amber";
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <div className="pt-6">
      <PixelPanel tone={tone} title={`▪ ${heading}`} titleAs="h2">
        <p className="p-5 text-sm leading-relaxed text-fg">{children}</p>
      </PixelPanel>
      <div className="pt-6">
        <IdLookupForm />
      </div>
    </div>
  );
}

function CertificateView({ cert }: { cert: VerifyPayload }) {
  const valid = cert.status === "valid";
  const issued = cert.issuedOn.slice(0, 10);
  const [copied, setCopied] = useState(false);

  // Next re-asserts the static shell's metadata during hydration, undoing the
  // worker's injected <title>; crawlers see the injected one, humans get the
  // tab title restored here.
  useEffect(() => {
    document.title = `${cert.recipientName} — Git Foundations Certificate — VersionControl.gr`;
  }, [cert.recipientName]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(cert.urls.verify);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable; the URL is in the address bar
    }
  }

  return (
    <div className="pt-6">
      {/* certificate-sheet is the print area; everything else hides in @media print */}
      <div className="certificate-sheet">
        <PixelPanel
          tone={valid ? "amber" : "red"}
          title={valid ? "▪ Valid certificate" : "▪ Revoked certificate"}
          titleAs="h2"
        >
          <div className="flex flex-col gap-5 p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <HudLabel tone={valid ? "phos" : "red"} className="text-xs">
                {valid ? "✓ Verified by VersionControl.gr" : "✗ Revoked by the issuer"}
              </HudLabel>
              <span className="hud text-[11px] text-muted">Certificate of completion</span>
            </div>

            <div>
              <p className="hud glow-text text-3xl text-phos">{cert.recipientName}</p>
              <p className="pt-2 text-sm leading-relaxed text-fg">
                completed <strong>{cert.achievementName}</strong>, the full
                VersionControl.gr interactive Git course. Certificate issued on{" "}
                <time dateTime={cert.issuedOn}>{issued}</time>.
              </p>
            </div>

            <div>
              <p className="hud pb-2 text-[11px] text-amber">Skills demonstrated</p>
              <ul className="grid gap-x-6 gap-y-1.5 text-sm text-fg sm:grid-cols-2">
                {cert.skills.map((skill) => (
                  <li key={skill} className="flex gap-2">
                    <span aria-hidden className="text-phos">
                      ✓
                    </span>
                    {skill}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-line pt-4">
              <span className="font-mono text-sm text-amber">{cert.credentialId}</span>
              <span className="font-mono text-xs text-muted">{cert.urls.verify}</span>
            </div>
          </div>
        </PixelPanel>
      </div>

      <div className="print-hidden flex flex-wrap gap-2 pt-4">
        <PixelButton tone="line" variant="ghost" type="button" onClick={() => window.print()}>
          Print
        </PixelButton>
        <a href={cert.urls.card}>
          <PixelButton tone="line" variant="ghost" type="button">
            Download PNG
          </PixelButton>
        </a>
        <PixelButton tone="line" variant="ghost" type="button" onClick={copyLink}>
          {copied ? "Copied" : "Copy link"}
        </PixelButton>
      </div>
      <p className="print-hidden pt-3 text-xs leading-relaxed text-muted">
        Machine-verifiable Open Badges 3.0 credential:{" "}
        <a href={cert.urls.credential} className="underline underline-offset-2 hover:text-phos">
          JSON
        </a>
        {" · "}
        <a href={cert.urls.jwt} className="underline underline-offset-2 hover:text-phos">
          compact JWS
        </a>
        {" · "}
        <a href={cert.urls.badge} className="underline underline-offset-2 hover:text-phos">
          baked badge PNG
        </a>
        . Signed by did:web:versioncontrol.gr.
      </p>
    </div>
  );
}
