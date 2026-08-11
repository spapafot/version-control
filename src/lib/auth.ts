import { create } from "zustand";
import { authConfigured, COGNITO_CLIENT_ID, COGNITO_USER_POOL_ID } from "./auth-config";

/**
 * Account state for the optional certification features. Tokens live in
 * Amplify's own storage (it handles refresh); this store only mirrors the
 * signed-in/out status for the UI, so it needs no persist.
 *
 * aws-amplify is imported lazily inside the actions: nothing on the page pays
 * for the auth chunk until a session check or auth action actually runs, and
 * no server component ever sees the library (it touches window at init).
 */
export type AuthStatus = "unknown" | "signedOut" | "confirmCode" | "signedIn";

interface AuthState {
  status: AuthStatus;
  /** signed-in user's email */
  email: string | null;
  /** email awaiting its verification code */
  pendingEmail: string | null;
  busy: boolean;
  error: string | null;
  init(): Promise<void>;
  signUp(email: string, password: string): Promise<void>;
  confirmCode(code: string): Promise<void>;
  resendCode(): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  requestReset(email: string): Promise<void>;
  confirmReset(email: string, code: string, newPassword: string): Promise<void>;
  signOut(): Promise<void>;
  clearError(): void;
}

let configured = false;
let initStarted = false;
/** kept out of the store; only for the auto-sign-in fallback after confirm */
let pendingPassword: string | null = null;

async function amplifyAuth() {
  const auth = await import("aws-amplify/auth");
  if (!configured) {
    const { Amplify } = await import("aws-amplify");
    Amplify.configure({
      Auth: {
        Cognito: {
          userPoolId: COGNITO_USER_POOL_ID,
          userPoolClientId: COGNITO_CLIENT_ID,
          loginWith: { email: true },
        },
      },
    });
    configured = true;
  }
  return auth;
}

/** Current Cognito ID token, refreshed by Amplify as needed; null when signed out. */
export async function getIdToken(): Promise<string | null> {
  if (!authConfigured()) return null;
  try {
    const { fetchAuthSession } = await amplifyAuth();
    return (await fetchAuthSession()).tokens?.idToken?.toString() ?? null;
  } catch {
    return null;
  }
}

function friendlyError(err: unknown): string {
  const name = (err as { name?: string })?.name ?? "";
  switch (name) {
    case "UsernameExistsException":
      return "An account with this email already exists. Try signing in.";
    case "NotAuthorizedException":
    case "UserNotFoundException":
      return "Wrong email or password.";
    case "CodeMismatchException":
    case "ExpiredCodeException":
      return "That code is wrong or has expired. Check the email again or resend.";
    case "InvalidPasswordException":
      return "Password too weak: use at least 10 characters with a lowercase letter and a number.";
    case "LimitExceededException":
    case "TooManyRequestsException":
      return "Too many attempts. Wait a minute and try again.";
    case "UserNotConfirmedException":
      return "This email is not verified yet. Enter the code we sent you.";
    case "InvalidParameterException":
      return "That does not look like a valid email address.";
    case "NetworkError":
      return "Network error. Check your connection and try again.";
    default:
      return "Something went wrong. Try again in a moment.";
  }
}

const NOT_CONFIGURED =
  "Accounts are not configured in this build. See src/lib/auth-config.ts.";

export const useAuth = create<AuthState>((set, get) => {
  /** wraps an action with busy/error bookkeeping; expected failures never escape */
  async function run(action: () => Promise<void>): Promise<void> {
    if (!authConfigured()) {
      set({ error: NOT_CONFIGURED, busy: false });
      return;
    }
    set({ busy: true, error: null });
    try {
      await action();
      set({ busy: false });
    } catch (err) {
      console.warn("[auth]", err);
      set({ busy: false, error: friendlyError(err) });
    }
  }

  async function finishSignIn(email: string) {
    pendingPassword = null;
    set({ status: "signedIn", email, pendingEmail: null, error: null });
  }

  return {
    status: "unknown",
    email: null,
    pendingEmail: null,
    busy: false,
    error: null,
    clearError: () => set({ error: null }),

    init: async () => {
      if (initStarted) return;
      initStarted = true;
      if (!authConfigured()) {
        set({ status: "signedOut" });
        return;
      }
      try {
        const { getCurrentUser, fetchUserAttributes } = await amplifyAuth();
        await getCurrentUser();
        let email: string | null = null;
        try {
          email = (await fetchUserAttributes()).email ?? null;
        } catch {
          // attributes are cosmetic here; stay signed in without them
        }
        set({ status: "signedIn", email });
        const { Hub } = await import("aws-amplify/utils");
        Hub.listen("auth", ({ payload }) => {
          if (payload.event === "signedOut" || payload.event === "tokenRefresh_failure") {
            set({ status: "signedOut", email: null });
          }
        });
      } catch {
        set({ status: "signedOut" });
      }
    },

    signUp: (email, password) =>
      run(async () => {
        const { signUp } = await amplifyAuth();
        const { nextStep } = await signUp({
          username: email,
          password,
          options: { userAttributes: { email }, autoSignIn: true },
        });
        if (nextStep.signUpStep === "CONFIRM_SIGN_UP") {
          pendingPassword = password;
          set({ status: "confirmCode", pendingEmail: email });
        } else {
          await finishSignIn(email);
        }
      }),

    confirmCode: (code) =>
      run(async () => {
        const email = get().pendingEmail;
        if (!email) return;
        const { confirmSignUp, autoSignIn, signIn } = await amplifyAuth();
        const { nextStep } = await confirmSignUp({ username: email, confirmationCode: code.trim() });
        if (nextStep.signUpStep === "COMPLETE_AUTO_SIGN_IN") {
          try {
            await autoSignIn();
          } catch {
            // auto-sign-in window expired; fall back to the retained password
            if (pendingPassword) await signIn({ username: email, password: pendingPassword });
            else {
              set({ status: "signedOut", pendingEmail: null });
              return;
            }
          }
        } else if (pendingPassword) {
          await signIn({ username: email, password: pendingPassword });
        }
        await finishSignIn(email);
      }),

    resendCode: () =>
      run(async () => {
        const email = get().pendingEmail;
        if (!email) return;
        const { resendSignUpCode } = await amplifyAuth();
        await resendSignUpCode({ username: email });
      }),

    signIn: (email, password) =>
      run(async () => {
        const { signIn } = await amplifyAuth();
        const { isSignedIn, nextStep } = await signIn({ username: email, password });
        if (isSignedIn) {
          await finishSignIn(email);
        } else if (nextStep.signInStep === "CONFIRM_SIGN_UP") {
          const { resendSignUpCode } = await amplifyAuth();
          pendingPassword = password;
          await resendSignUpCode({ username: email });
          set({ status: "confirmCode", pendingEmail: email });
        } else {
          set({ error: "This sign-in needs a step the site does not support yet." });
        }
      }),

    requestReset: (email) =>
      run(async () => {
        const { resetPassword } = await amplifyAuth();
        await resetPassword({ username: email });
      }),

    confirmReset: (email, code, newPassword) =>
      run(async () => {
        const { confirmResetPassword } = await amplifyAuth();
        await confirmResetPassword({ username: email, confirmationCode: code.trim(), newPassword });
      }),

    signOut: () =>
      run(async () => {
        const { signOut } = await amplifyAuth();
        await signOut();
        // Local progress deliberately survives sign-out ("your progress stays
        // in this browser") — only the session ends here.
        set({ status: "signedOut", email: null, pendingEmail: null });
      }),
  };
});
