# vc-api-proxy - Cloudflare Worker for api.versioncontrol.gr

Thin proxy in front of the certification backend (FastAPI on an AWS Lambda
Function URL, AuthType `NONE`). The Worker is the only usable front door: it
injects the shared `X-Proxy-Secret` header the FastAPI middleware requires,
handles CORS for versioncontrol.gr, forwards the real client IP as
`X-Client-IP`, and edge-caches the public `GET /v1/verify/*` and
`GET /v1/credentials/*` responses (only when the backend sends
`Cache-Control`, and only for 200/404).

This Worker is deployed separately from the site Worker in the repo root -
do not mix the two configs.

## Deploy

```
cd workers/api
pnpm install          # or npm install

# 1. Deploy:
npx wrangler deploy

# 2. Set BOTH runtime values BY HAND in the Cloudflare dashboard:
#    Workers & Pages -> vc-api-proxy -> Settings -> Variables ->
#    add two plaintext variables with values from scripts/aws/out/stack.env:
#      LAMBDA_URL   - the FUNCTION_URL, no trailing slash
#      PROXY_SECRET - the shared secret
#    Neither is in wrangler.jsonc, so neither lands in git. `keep_vars: true`
#    makes later deploys preserve dashboard-set variables - without it every
#    deploy would wipe them and the API would start failing.
```

Rotating the secret is manual: change the Lambda env var in the AWS console,
then this dashboard variable, back to back (single-value check on the backend,
so requests 403 in the seconds between the two edits).

The `custom_domain: true` route creates `api.versioncontrol.gr` automatically
(DNS + cert) - this requires the versioncontrol.gr zone to be on the same
Cloudflare account as the Worker, which it is. The hostname must not already
have a conflicting DNS record.

Smoke check after deploy:

```
curl -i https://api.versioncontrol.gr/v1/health
```

## Local dev

```
npx wrangler dev
```

Dashboard variables do not apply to `wrangler dev` - put both values in a
`.dev.vars` file instead:

```
# workers/api/.dev.vars   (gitignored - never commit)
LAMBDA_URL=<FUNCTION_URL from scripts/aws/out/stack.env>
PROXY_SECRET=<value from scripts/aws/out/stack.env>
```

To test against a locally running backend instead, point `LAMBDA_URL` in
`.dev.vars` at your local uvicorn (`http://127.0.0.1:8000`). `.dev.vars`
overrides both the var and the secret for `wrangler dev` only. Or skip the
Worker entirely and curl uvicorn directly with the header:
`curl -H "X-Proxy-Secret: ..." http://127.0.0.1:8000/v1/health`.

## Notes

- CORS allowlist lives in `src/index.ts` (`ALLOWED_ORIGINS`); the two
  localhost entries are for development and can be removed.
- Cached entries are stored WITHOUT CORS headers; CORS is applied per
  response, so one origin's headers never leak to another.
- Runtime types come from the generated `worker-configuration.d.ts` (wrangler
  now supersedes `@cloudflare/workers-types` with these). Rerun
  `npx wrangler types` (or `pnpm cf-typegen`) after changing wrangler.jsonc,
  then `pnpm check` for `tsc --noEmit`.
