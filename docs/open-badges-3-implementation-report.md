# Open Badges 3.0 at VersionControl.gr

Implementation report and interoperability notes, 20 August 2026.

## Status

VersionControl.gr issues a certificate after an authenticated learner completes all 78 hands-on Git missions. The certificate is also an Open Badges 3.0 `OpenBadgeCredential` secured as an RS256 VC-JWT and available as a baked PNG.

The final production credential was successfully verified by the official 1EdTech Open Badges 3.0 verifier using both the hosted JWT and the uploaded PNG. Credly's outside-badge importer still returns a generic processing error without identifying a failed field, signature check, or policy.

This means the credential has an independent standards-conformance result, while Credly interoperability remains unresolved at the platform-import layer.

## What Open Badges 3.0 is

[Open Badges 3.0](https://www.imsglobal.org/spec/ob/v3p0/) is a 1EdTech standard for portable, verifiable records of achievement. A badge is more than an image: it is structured data describing the issuer, recipient, achievement, criteria, evidence or skills, validity period, and cryptographic proof.

Version 3 aligns Open Badges with the [W3C Verifiable Credentials Data Model 2.0](https://www.w3.org/TR/vc-data-model-2.0/). The important roles are:

| Role | Responsibility |
| --- | --- |
| Issuer | Defines the achievement, confirms that the learner earned it, creates the credential, and signs it. |
| Subject/earner | The person or entity about whom the achievement claim is made. |
| Holder | Stores and presents the credential. Usually, but not necessarily, the subject. |
| Verifier/displayer | Reads the credential, verifies its signature and semantics, checks status, and displays the result. |
| Host/wallet | Stores credentials for the holder and helps move them between systems. |

Open Badges 3.0 combines several standards:

- JSON-LD provides machine-readable vocabulary and meaning through protected contexts.
- The W3C Verifiable Credentials model supplies the credential structure.
- JWT/JWS or a Data Integrity proof supplies tamper evidence and issuer authentication.
- PNG or SVG baking makes the credential portable inside its badge image.
- The Open Badges API optionally supports learner-controlled exchange between issuers, hosts, and displayers.

## How a VersionControl.gr credential works

### 1. Eligibility and issuance

The authenticated account must have:

- a certificate display name;
- synced completion for every one of the 78 missions; and
- no current certificate reference for the Git Foundations award.

Issuance creates two DynamoDB records atomically:

- an immutable credential record keyed by its public credential ID; and
- an account reference that makes issuance idempotent and prevents duplicate active certificates.

The credential record contains the recipient display name for the public certificate page, the issue time, the covered skills, the canonical JSON credential, its compact JWS, a salted identity hash, and revocation state.

### 2. Credential contents

The JSON-LD document uses these contexts in this order:

```json
[
  "https://www.w3.org/ns/credentials/v2",
  "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json"
]
```

Its main objects are:

- `type`: `VerifiableCredential` and `OpenBadgeCredential`;
- `issuer`: the VersionControl.gr issuer profile;
- `credentialSubject`: the stable subject identifier and privacy-preserving email identity;
- `achievement`: the Git Foundations achievement, its description, completion criteria, image, and `tag` values;
- `validFrom`: the issuance time; and
- `id`: the permanent public credential URL.

The email address is not published in plaintext. The credential contains an `IdentityObject` with a per-credential random salt and a SHA-256 hash of the normalized email plus that salt.

### 3. VC-JWT signing

The credential is signed as a compact JWS with this JOSE profile:

```json
{
  "alg": "RS256",
  "kid": "https://versioncontrol.gr/.well-known/openbadges-jwk.json",
  "typ": "JWT"
}
```

The JWT payload contains the complete Open Badge credential at its top level, following the W3C VC 2.0 form. It also carries the JWT claims required for Open Badges verification:

| JWT claim | Must equal |
| --- | --- |
| `iss` | `issuer.id` |
| `sub` | `credentialSubject.id` |
| `jti` | credential `id` |
| `nbf` | `validFrom` converted to NumericDate |
| `iat` | issuance time as NumericDate |

The private 2048-bit RSA key is stored only in the Lambda environment/deployment secret record. The corresponding public JWK is available over HTTPS. A verifier dereferences `kid`, constructs the RSA public key from the JWK, and verifies the RS256 signature.

The RSA/JWK choice follows the broadly interoperable JWT profile described in the [1EdTech Open Badges implementation guide](https://standards.1edtech.org/open-badges/guides/standards/v3p0/impl). Legacy public verification material is retained so credentials signed with the earlier key do not lose their historical proof.

### 4. PNG baking

The downloadable badge is a real PNG with the compact JWS embedded in a single `iTXt` chunk:

```text
keyword: openbadgecredential
compression: disabled
text: <header>.<payload>.<signature>
```

The PNG contains exactly one `openbadgecredential` chunk, and its text is byte-for-byte identical to the hosted JWT. This follows the [Open Badges 3.0 PNG baking rules](https://www.imsglobal.org/spec/ob/v3p0/#baked-badge).

The separate 1200x630 certificate card is designed for presentation and social sharing. It is not the baked Open Badge; the 600x600 badge PNG is the portable credential artifact.

### 5. Public endpoints

For a credential ID `<ID>`, the service exposes:

| Resource | URL |
| --- | --- |
| Human verification page | `https://versioncontrol.gr/verify/<ID>/` |
| Open Badge JSON | `https://api.versioncontrol.gr/v1/credentials/<ID>` |
| Signed VC-JWT | `https://api.versioncontrol.gr/v1/credentials/<ID>?format=jwt` |
| Baked badge | `https://api.versioncontrol.gr/v1/credentials/<ID>/badge.png` |
| Presentation card | `https://api.versioncontrol.gr/v1/credentials/<ID>/card.png` |
| Public status | `https://api.versioncontrol.gr/v1/verify/<ID>` |

The JWT is served as `text/plain`, the credential as JSON, and the badge as `image/png`. Credential artifacts are immutable. Status is a separate, short-cached lookup so revocation can be observed without changing the signed artifact.

### 6. Verification

A conforming verifier can perform the following sequence:

1. Obtain the compact JWS directly or extract it from the baked PNG.
2. Decode the JOSE header and ensure the declared algorithm is permitted.
3. Dereference `kid` and retrieve the issuer's public JWK.
4. Verify the JWS signature.
5. Decode the payload as an `OpenBadgeCredential`.
6. Check the required equality relationships for `iss`, `sub`, `jti`, and `nbf`.
7. Validate the JSON structure against the Open Badges schema.
8. Expand/validate the JSON-LD in safe mode so undefined vocabulary terms are rejected.
9. Check issuance/expiry and the issuer's current credential status.
10. Display the issuer, achievement, recipient binding, criteria, skills, and validity result.

JSON Schema and JSON-LD validation are complementary. Passing one does not imply passing the other.

### 7. Revocation and reissuance

Issued artifacts are immutable. A faulty credential is not edited in place because doing so would invalidate its signature and make its permanent URL ambiguous.

Instead, VersionControl.gr:

1. marks the old credential as revoked;
2. preserves the old public record and artifacts for auditability;
3. removes only the matching account certificate reference; and
4. lets the same eligible account issue a new credential with a new ID.

Profile data and course progress are not deleted during this operation.

## Work completed

The interoperability work was performed in several stages:

1. Added a stable `credentialSubject.id` and the matching JWT `sub` claim.
2. Corrected the JOSE `typ` value from `vc+jwt` to `JWT`.
3. Replaced the EdDSA signing profile for new credentials with RS256.
4. Published a directly dereferenceable HTTPS RSA public JWK.
5. Added RSA configuration, key validation, signing tests, and deployment safeguards.
6. Preserved the previous key material needed to verify older credentials.
7. Confirmed that the hosted JWK matches the production private key without exposing that key.
8. Changed the achievement metadata property from invalid `tags` to the Open Badges term `tag`.
9. Added regression assertions for the JOSE header, RSA key, subject mapping, tamper rejection, and singular `tag` property.
10. Deployed the public JWK before activating the corresponding production signer.
11. Revoked and reissued test credentials rather than mutating already signed records.
12. Validated the final hosted JWT and uploaded PNG with the official 1EdTech Open Badges 3.0 verifier.

## Issues encountered and how they were resolved

### Missing subject identifier and `sub`

The first credential did not provide the explicit subject relationship expected by VC-JWT verification.

Fix:

- assign a unique `credentialSubject.id` derived from the credential URL; and
- copy that exact value into the JWT `sub` claim.

This makes the recipient binding explicit without publishing the recipient's email address.

### Non-interoperable JOSE `typ`

The original header used `typ: "vc+jwt"`. The Open Badges VC-JWT profile expects `typ: "JWT"` when the optional field is present.

Fix:

- change the protected header to `typ: "JWT"`; and
- test the complete header key set and exact values.

### Signing profile compatibility

The initial credential used EdDSA and a DID-based key reference. That can be cryptographically sound, but wallet support varies across proof mechanisms and key-resolution methods. The 1EdTech implementation guidance identifies RS256 with JWK key material as the broadly supported JWT choice.

Fix:

- generate a 2048-bit RSA signing key;
- sign new credentials with RS256;
- publish the public key as a JWK at a permanent HTTPS URL; and
- use that URL as the JWS `kid`.

The JWK was published before the production signer was switched, avoiding a window in which new credentials referenced a key that verifiers could not retrieve.

### `tags` passed JSON Schema but failed JSON-LD

The achievement originally used:

```json
{"tags": ["Git", "Version Control"]}
```

The Open Badges 3.0 protected context defines the singular property `tag`, whose value may be a set/array. It does not define `tags`.

The published JSON Schema did not reject the extra property, so schema validation and local shape tests passed. The official verifier's JSON-LD safe-mode validation correctly reported:

```text
Undefined JSON-LD term: tags
```

Fix:

```json
{"tag": ["Git", "Version Control"]}
```

After this correction and reissuance, 1EdTech verified both the hosted JWT and uploaded PNG.

This was the most important testing lesson: Open Badges CI must include JSON-LD safe-mode processing, not only JSON Schema validation.

### Credly's generic importer failure

Credly rejected both the verification/credential URL path and the baked PNG during earlier attempts. After all reported conformance defects were fixed, the final credential passed the official 1EdTech verifier but Credly continued to return the same generic message:

```text
Something went wrong when processing this badge.
```

Credly did not identify a field, JSON-LD term, signature error, HTTP failure, recipient mismatch, or trust-policy decision. Its public instructions say that outside badges must comply with Open Badge standards, but the UI does not expose a validation report.

The evidence therefore supports this limited conclusion:

- the final credential is independently verified as Open Badges 3.0;
- no remaining credential defect is known from the 1EdTech report;
- Credly's rejection is specific to its importer behavior, compatibility matrix, issuer policy, or another undisclosed check; and
- the generic message is insufficient to distinguish among those possibilities.

This does not prove that Credly has a defect. It means the failure cannot be diagnosed further without a detailed Credly-side log or support response.

## Validation evidence

The implementation was checked at several levels.

### Automated tests

- 193 backend tests passed.
- 249 frontend, Git engine, validator, and challenge-solution tests passed.
- Focused credential signing, public endpoint, baking, tamper, and revocation tests passed.
- The static Next.js build and SEO checks passed during the deployment work.
- Whitespace and Python compilation checks passed.

This also confirms that the certificate changes did not alter challenge behavior or solution validity.

### Production artifact checks

For reissued production credentials, the following were verified directly:

- public status was `valid`;
- JOSE header was exactly RS256, HTTPS `kid`, and `typ: JWT`;
- the live JWK reconstructed a 2048-bit RSA public key;
- the RS256 signature verified;
- `iss`, `sub`, `jti`, `nbf`, and credential fields matched;
- the hosted JSON matched the credential signed inside the JWT;
- the PNG was a valid 600x600 image;
- it contained exactly one uncompressed `openbadgecredential` iTXt chunk;
- the baked JWS exactly matched the hosted JWS;
- HTTP status codes, content types, caching, and download headers were correct; and
- the credential passed the published Open Badges JSON Schema.

### Independent verification

The final corrected credential passed the [official 1EdTech public validator](https://vc.1ed.tech/) as both:

- a hosted VC-JWT URL; and
- an uploaded baked PNG.

1EdTech's [conformance guide](https://standards.1edtech.org/open-badges/specifications/standards/v3p0/cert) specifically requires JSON-LD safe-mode validation, which is the check that exposed the invalid `tags` term.

## Operational guidance

### Key management

- Never place the RSA private key in the repository, static site, badge, JWT, or logs.
- Publish only the public JWK.
- Validate that the public JWK corresponds to the production private key before activation.
- Publish a new public key before issuing anything that references it.
- Never remove public keys while unexpired or historically relevant credentials still reference them.
- Preserve Lambda environment variables during ordinary code deployments.

### Issuance

- Treat credential JSON and JWS as immutable after issuance.
- Keep issuance and account-reference creation atomic.
- Use a unique credential ID and a per-credential identity salt.
- Confirm all registered JWT claims equal their Open Badge counterparts.

### Testing

Every credential fixture should be checked with:

- model/shape assertions;
- the published Open Badges JSON Schema;
- JSON-LD expansion in safe mode using the exact production contexts;
- signature verification using the published key;
- registered-claim equality checks;
- baked-image extraction and byte equality; and
- revocation/status behavior.

Before a signing or context change reaches production, submit a publicly reachable pre-production credential to the official 1EdTech validator. This catches semantic failures that ordinary JSON tests cannot see.

### Credly follow-up

A useful Credly support request should include:

- the direct VC-JWT URL;
- the baked PNG;
- the permanent verification page;
- the successful 1EdTech validation report;
- the exact UTC time of the Credly attempt; and
- a request for the internal parsing/verification failure code.

Until Credly provides that information, VersionControl.gr should describe its credential as Open Badges 3.0 verified by 1EdTech, but should not promise that it can be imported into every third-party wallet.

## Main lessons

1. Standards conformance has multiple layers: JSON syntax, JSON Schema, JSON-LD semantics, proof verification, claim relationships, HTTP retrieval, and status checks.
2. JSON Schema alone is not enough for JSON-LD credentials.
3. A technically valid cryptographic option is not necessarily the most interoperable option.
4. The official validator should be used early, before testing individual commercial wallets.
5. Signed credentials should be immutable; correction means revoke and reissue.
6. Passing the standard's verifier and being accepted by a particular platform are related but separate outcomes.
7. Importers need actionable error reports. A generic processing failure is not enough for issuer debugging.

## References

- [Open Badges Specification 3.0](https://www.imsglobal.org/spec/ob/v3p0/)
- [Open Badges 3.0 Implementation Guide](https://standards.1edtech.org/open-badges/guides/standards/v3p0/impl)
- [Open Badges 3.0 Conformance and Certification Guide](https://standards.1edtech.org/open-badges/specifications/standards/v3p0/cert)
- [Open Badges 3.0 JSON-LD context](https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json)
- [Open Badges 3.0 AchievementCredential JSON Schema](https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_achievementcredential_schema.json)
- [1EdTech public Open Badges validator](https://vc.1ed.tech/)
- [1EdTech public validator source](https://github.com/1EdTech/digital-credentials-public-validator)
- [W3C Verifiable Credentials Data Model 2.0](https://www.w3.org/TR/vc-data-model-2.0/)
- [Credly: adding an outside badge](https://support.credly.com/hc/en-us/articles/30107800919707-How-to-Add-an-Outside-Badge-to-Your-Credly-Profile)
