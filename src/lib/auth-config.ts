/**
 * Cognito + API constants, hardcoded like the GA measurement id: the values
 * are public by design (a Cognito SPA app client has no secret) and this site
 * has no env-var pipeline.
 *
 * The pool/client ids come from `scripts/aws/20-create-cognito.sh` (printed at
 * the end of the run and saved in scripts/aws/out/stack.env). Until real
 * values are pasted in, auth actions fail with a clear "not configured" error
 * while the rest of the site works normally.
 */
export const COGNITO_USER_POOL_ID = "eu-central-1_kt2tlw2vA";
export const COGNITO_CLIENT_ID = "69n4pl2j755mekcg14c11m34iu";
export const API_BASE = "https://api.versioncontrol.gr";

export function authConfigured(): boolean {
  // Shape checks, not value checks: a real pool id is "<region>_<id>" and a
  // real SPA client id is a ~26-char lowercase alphanumeric string. Anything
  // else (REPLACE_ME placeholders included) disables auth gracefully.
  return (
    /^[a-z]{2}-[a-z]+-\d+_[A-Za-z0-9]+$/.test(COGNITO_USER_POOL_ID) &&
    /^[a-z0-9]{20,}$/.test(COGNITO_CLIENT_ID)
  );
}
