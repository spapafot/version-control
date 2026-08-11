import { SITE } from "./seo";

/** Shared shape of an issued certificate (backend CertificateOut). */
export interface Certificate {
  credentialId: string;
  recipientName: string;
  /** ISO instant */
  issuedOn: string;
  skills: string[];
  urls: {
    verify: string;
    credential: string;
    jwt: string;
    badge: string;
    card: string;
  };
}

/** Public payload of GET /v1/verify/{id} (also injected by the site worker). */
export interface VerifyPayload {
  status: "valid" | "revoked";
  credentialId: string;
  recipientName: string;
  issuedOn: string;
  achievementName: string;
  skills: string[];
  urls: Certificate["urls"];
}

/** The island the site worker fills on /verify/{id}/ pages. */
export type CertIsland =
  | { ok: true; cert: VerifyPayload }
  | { ok: false; status: 404 | 410; id: string }
  | null;

export const CREDENTIAL_ID_PATTERN = /^VC-GIT-F-[0-9A-HJKMNP-TV-Z]{8}$/;

/** Human name of the achievement, mirrored from the backend credential. */
export const ACHIEVEMENT_NAME = "Git Foundations";

export function verifyUrl(credentialId: string): string {
  return `${SITE.url}/verify/${credentialId}/`;
}

/**
 * LinkedIn "Add to profile" deep link. LinkedIn has no badge API; this
 * documented URL prefills the certification form, and `certUrl` becomes the
 * "Show credential" button pointing at our verify page.
 */
export function linkedInAddToProfileUrl(cert: Pick<Certificate, "credentialId" | "issuedOn">): string {
  const issued = new Date(cert.issuedOn);
  const params = new URLSearchParams({
    startTask: "CERTIFICATION_NAME",
    name: `${ACHIEVEMENT_NAME} — ${SITE.name}`,
    issueYear: String(issued.getUTCFullYear()),
    issueMonth: String(issued.getUTCMonth() + 1),
    certUrl: verifyUrl(cert.credentialId),
    certId: cert.credentialId,
  });
  return `https://www.linkedin.com/profile/add?${params.toString()}`;
}
