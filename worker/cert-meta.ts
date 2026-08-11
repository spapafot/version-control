/**
 * Pure builders for the head metadata, crawler text and JSON-LD the edge
 * worker injects into /verify/{id}/ pages. Kept dependency-free so the worker
 * bundle stays tiny.
 */

/** Keep in sync with VerifyPayload in src/lib/certificate.ts (type-only twin:
 * importing it would drag app modules into the worker's tsconfig). */
export interface VerifyPayload {
  status: "valid" | "revoked";
  credentialId: string;
  recipientName: string;
  issuedOn: string;
  achievementName: string;
  skills: string[];
  urls: {
    verify: string;
    credential: string;
    jwt: string;
    badge: string;
    card: string;
  };
}

/** HTML-escape untrusted text (recipient names are user-supplied). */
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** JSON for a <script type="application/json"> island: "<" can never close the tag. */
export function islandJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function certTitle(p: VerifyPayload): string {
  return `${p.recipientName} — Git Foundations Certificate — VersionControl.gr`;
}

export function certDescription(p: VerifyPayload): string {
  const date = p.issuedOn.slice(0, 10);
  return `${p.recipientName} completed all 63 missions of the VersionControl.gr Git course on ${date}. Credential ${p.credentialId} covers branching, merging, conflict resolution and more.`;
}

export function notFoundTitle(): string {
  return "Certificate not found — VersionControl.gr";
}

export function revokedTitle(): string {
  return "Certificate revoked — VersionControl.gr";
}

export function errorDescription(id: string, revoked: boolean): string {
  return revoked
    ? `The VersionControl.gr certificate ${id} has been revoked by the issuer and is no longer valid.`
    : `No VersionControl.gr certificate with the ID ${id} exists. Check the credential ID and try again.`;
}

/** Crawler-visible summary for the [data-cert-slot] element (client JS replaces it). */
export function slotHtml(p: VerifyPayload): string {
  const date = p.issuedOn.slice(0, 10);
  const statusLine =
    p.status === "valid"
      ? "This certificate is valid."
      : "This certificate has been revoked and is no longer valid.";
  const skills = p.skills.map((s) => `<li>${esc(s)}</li>`).join("");
  return (
    `<p><strong>${esc(p.recipientName)}</strong> completed ${esc(p.achievementName)}, ` +
    `the full VersionControl.gr interactive Git course (all 63 missions), on ${esc(date)}. ` +
    `Credential ID ${esc(p.credentialId)}. ${statusLine}</p>` +
    `<p>Skills demonstrated:</p><ul>${skills}</ul>`
  );
}

export function errorSlotHtml(id: string, revoked: boolean): string {
  return `<p>${esc(errorDescription(id, revoked))}</p>`;
}

/** schema.org JSON-LD; @id references resolve against the site-wide entities
 * the root layout already emits on every page. */
export function credentialJsonLd(p: VerifyPayload): string {
  return islandJson({
    "@context": "https://schema.org",
    "@type": "EducationalOccupationalCredential",
    "@id": `${p.urls.verify}#credential`,
    name: `${p.achievementName} Certificate — ${p.recipientName}`,
    credentialCategory: "certificate",
    url: p.urls.verify,
    dateCreated: p.issuedOn,
    teaches: p.skills,
    about: { "@id": "https://versioncontrol.gr/#course" },
    recognizedBy: { "@id": "https://versioncontrol.gr/#organization" },
  });
}
