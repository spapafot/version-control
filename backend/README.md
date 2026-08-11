# VersionControl.gr Certification API

FastAPI service that syncs course progress and issues **Open Badges 3.0**
certificates ("Git Foundations") for [VersionControl.gr](https://versioncontrol.gr).
Deployed as an AWS Lambda Function URL via Mangum (`app.main.handler`), fronted
by a proxy that injects `X-Proxy-Secret`. Storage is a single DynamoDB table;
auth is Cognito ID tokens.

## Run locally

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate          # Windows (Git Bash: source .venv/Scripts/activate)
pip install -r requirements-dev.txt

# every request must carry X-Proxy-Secret matching PROXY_SECRET
export TABLE_NAME=vc-cert-dev PROXY_SECRET=dev-secret \
       COGNITO_USER_POOL_ID=... COGNITO_CLIENT_ID=... \
       ISSUER_PRIVATE_KEY_B64=$(python -c "import base64,os;print(base64.b64encode(os.urandom(32)).decode())")
uvicorn app.main:app --reload
```

Run the tests (no network, no real AWS — DynamoDB is moto, Cognito is a local
RSA keypair):

```bash
pytest
```

Target runtime is **python3.12** on Lambda; keep the code 3.12-compatible.

## Environment variables

| Variable                 | Required | Default                          | Purpose                                                        |
| ------------------------ | -------- | -------------------------------- | -------------------------------------------------------------- |
| `TABLE_NAME`             | yes      | —                                | DynamoDB table (single-table layout, `PK`/`SK` string keys)    |
| `AWS_REGION`             | yes      | `eu-central-1`                   | Region for DynamoDB + Cognito JWKS URL                         |
| `COGNITO_USER_POOL_ID`   | yes      | —                                | ID-token issuer validation                                     |
| `COGNITO_CLIENT_ID`      | yes      | —                                | ID-token audience validation                                   |
| `PROXY_SECRET`           | yes      | —                                | Shared secret the edge proxy sends as `X-Proxy-Secret`         |
| `ISSUER_PRIVATE_KEY_B64` | yes      | —                                | Base64 of the 32-byte Ed25519 seed used to sign credentials    |
| `ISSUER_KID`             | no       | `did:web:versioncontrol.gr#key-0`| `kid` header of issued VC-JWTs                                 |
| `API_BASE`               | no       | `https://api.versioncontrol.gr`  | Base of credential URLs embedded in issued credentials         |
| `SITE_BASE`              | no       | `https://versioncontrol.gr`      | Base of verify/badge/achievement URLs                          |

## Endpoints

All routes require `X-Proxy-Secret`. Routes marked *auth* additionally require
`Authorization: Bearer <Cognito ID token>` (verified email).

| Method | Path                                | Auth | Description                                              |
| ------ | ----------------------------------- | ---- | -------------------------------------------------------- |
| GET    | `/v1/me`                            | auth | Profile + progress + certificate (if any)                |
| PUT    | `/v1/me`                            | auth | Set `displayName` (1–60 chars, must contain letter/digit)|
| POST   | `/v1/sync`                          | auth | Monotone-merge client progress; returns merged blob      |
| POST   | `/v1/certificates`                  | auth | Issue (idempotent) the Git Foundations certificate       |
| GET    | `/v1/verify/{id}`                   | —    | Verification oracle: `valid` / `revoked` / 404           |
| GET    | `/v1/credentials/{id}`              | —    | OB 3.0 credential JSON (`?format=jwt` → compact JWS)     |
| GET    | `/v1/credentials/{id}/badge.png`    | —    | Badge PNG with the JWS baked into an `openbadgecredential` iTXt chunk |
| GET    | `/v1/credentials/{id}/card.png`     | —    | 1200×630 share card                                      |

Error bodies are `{"code": "..."}` (e.g. `display_name_required`,
`incomplete` + `missing[]`, `invalid_display_name`, `unauthorized`,
`forbidden`).

## Runbooks

### Proxy-secret rotation (manual)

Environment variables are managed by hand in the Lambda console
(Configuration → Environment variables); the deploy scripts never touch them
after creation. Only one `PROXY_SECRET` value is accepted at a time, so
rotation is: update the value in the Lambda console, then immediately update
the `PROXY_SECRET` variable on the `vc-api-proxy` Worker in the Cloudflare
dashboard. Requests 403 in the window between the two edits — do them back to
back (a few seconds of failed syncs is harmless; clients retry).

### Issuer key rotation

1. Generate a new Ed25519 seed; publish the new public key in the
   `did:web:versioncontrol.gr` DID document **alongside** the old one.
2. Deploy with the new `ISSUER_PRIVATE_KEY_B64` and a bumped `ISSUER_KID`
   (e.g. `...#key-1`). Already-issued JWS stay verifiable via the old
   key in the DID document — never remove a key that live credentials
   reference.

### Revocation

Set `revoked = true` on the `CERT#{id}/CERT` item. `/v1/verify/{id}` is the
revocation oracle and will report `"revoked"` once caches expire (max-age 300 /
s-maxage 3600). The credential/badge/card endpoints intentionally keep serving
(immutable caching) but add `X-Credential-Status: revoked`.

### GDPR erasure

For a subject `sub`:

1. Delete all `USER#{sub}/*` items (PROFILE, PROGRESS, CERTREF).
2. Look up the CERTREF first to find `certId`, then delete `CERT#{certId}/CERT`.
   After that, verify/credential/badge/card return 404 (CDN copies age out per
   the cache headers). The credential itself contains no plain email — only a
   salted SHA-256 hash — but it does embed the recipient's display name in the
   DynamoDB item, so the CERT item must go too.
3. Cognito account deletion is handled in the user pool, outside this service.

## Notes

- `app/data/challenges.json` is a build-time snapshot of the course (63 slugs
  in 10 sections, 12 achievements). Regenerate from `src/challenges/*.ts`
  whenever the course changes; `app.merge` asserts the totals at import.
- The VC-JWT `typ` header is the module constant
  `app.credential.CREDENTIAL_JWT_TYP` (`"vc+jwt"`). If the 1EdTech validator
  objects, flip it to `"JWT"` there — nothing else changes.
- `app/assets/badge-template.png` is generated by
  `python scripts/make_badge_template.py` (Pillow, deterministic pixel art).
- Fonts in `app/assets/fonts/` are the real OFL releases (JetBrains Mono
  v2.304, Inter v4.1 static SemiBold), both with Greek coverage — no
  placeholders.
