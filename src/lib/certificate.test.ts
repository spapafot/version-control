import { describe, expect, it } from "vitest";
import { CREDENTIAL_ID_PATTERN, linkedInAddToProfileUrl, verifyUrl } from "./certificate";

describe("verifyUrl", () => {
  it("builds the permanent trailing-slash URL on the apex domain", () => {
    expect(verifyUrl("VC-GIT-F-7K4M9P2X")).toBe(
      "https://versioncontrol.gr/verify/VC-GIT-F-7K4M9P2X/",
    );
  });
});

describe("CREDENTIAL_ID_PATTERN", () => {
  it("accepts Crockford-base32 ids and rejects lookalikes", () => {
    expect(CREDENTIAL_ID_PATTERN.test("VC-GIT-F-7K4M9P2X")).toBe(true);
    expect(CREDENTIAL_ID_PATTERN.test("VC-GIT-F-7K4M9P2")).toBe(false); // too short
    expect(CREDENTIAL_ID_PATTERN.test("VC-GIT-F-7K4M9P2I")).toBe(false); // I excluded
    expect(CREDENTIAL_ID_PATTERN.test("vc-git-f-7k4m9p2x")).toBe(false); // lowercase
  });
});

describe("linkedInAddToProfileUrl", () => {
  const cert = { credentialId: "VC-GIT-F-7K4M9P2X", issuedOn: "2026-08-11T09:30:00.000Z" };

  it("targets the documented add-to-profile endpoint with all params", () => {
    const url = new URL(linkedInAddToProfileUrl(cert));
    expect(url.origin + url.pathname).toBe("https://www.linkedin.com/profile/add");
    expect(url.searchParams.get("startTask")).toBe("CERTIFICATION_NAME");
    expect(url.searchParams.get("name")).toContain("Git Foundations");
    expect(url.searchParams.get("issueYear")).toBe("2026");
    expect(url.searchParams.get("issueMonth")).toBe("8");
    expect(url.searchParams.get("certUrl")).toBe("https://versioncontrol.gr/verify/VC-GIT-F-7K4M9P2X/");
    expect(url.searchParams.get("certId")).toBe("VC-GIT-F-7K4M9P2X");
  });

  it("URL-encodes reserved characters so the query survives round-tripping", () => {
    const raw = linkedInAddToProfileUrl(cert);
    // the verify URL's "://" must be percent-encoded inside certUrl
    expect(raw).toContain("certUrl=https%3A%2F%2F");
    // the em-dash in the certification name must be encoded, not literal
    expect(raw).not.toContain("—");
  });

  it("uses the UTC issue month across year boundaries", () => {
    const url = new URL(
      linkedInAddToProfileUrl({ credentialId: cert.credentialId, issuedOn: "2025-12-31T23:59:59.000Z" }),
    );
    expect(url.searchParams.get("issueYear")).toBe("2025");
    expect(url.searchParams.get("issueMonth")).toBe("12");
  });
});
