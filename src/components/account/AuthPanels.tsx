"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { HudLabel, PixelButton, PixelField, PixelInput, PixelPanel } from "@/components/ui/pixel";

type Mode = "signin" | "signup" | "reset" | "reset-confirm";

/** Sign in / create account / reset password, all inline (no redirects). */
export function SignInPanel() {
  const { busy, error, signIn, signUp, requestReset, confirmReset, clearError } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  function switchMode(next: Mode) {
    clearError();
    setMode(next);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const mail = email.trim().toLowerCase();
    if (mode === "signin") await signIn(mail, password);
    else if (mode === "signup") await signUp(mail, password);
    else if (mode === "reset") {
      await requestReset(mail);
      if (!useAuth.getState().error) switchMode("reset-confirm");
    } else {
      await confirmReset(mail, code, password);
      if (!useAuth.getState().error) {
        setCode("");
        switchMode("signin");
      }
    }
  }

  const title =
    mode === "signin" ? "▪ Sign in" : mode === "signup" ? "▪ Create account" : "▪ Reset password";

  return (
    <PixelPanel tone="phos" title={title} titleAs="h2">
      <form onSubmit={onSubmit} className="flex flex-col gap-4 p-5" noValidate>
        <div className="flex gap-2">
          <PixelButton
            type="button"
            variant={mode === "signin" ? "solid" : "ghost"}
            tone="phos"
            onClick={() => switchMode("signin")}
          >
            Sign in
          </PixelButton>
          <PixelButton
            type="button"
            variant={mode === "signup" ? "solid" : "ghost"}
            tone="phos"
            onClick={() => switchMode("signup")}
          >
            Create account
          </PixelButton>
        </div>

        <PixelField label="Email" htmlFor="acct-email">
          <PixelInput
            id="acct-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </PixelField>

        {mode === "reset-confirm" && (
          <PixelField
            label="Reset code"
            htmlFor="acct-reset-code"
            hint="We emailed a code to the address above."
          >
            <PixelInput
              id="acct-reset-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </PixelField>
        )}

        {mode !== "reset" && (
          <PixelField
            label={mode === "reset-confirm" ? "New password" : "Password"}
            htmlFor="acct-password"
            hint={
              mode === "signup" || mode === "reset-confirm"
                ? "At least 10 characters, with a lowercase letter and a number."
                : undefined
            }
          >
            <PixelInput
              id="acct-password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              minLength={10}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </PixelField>
        )}

        {error && (
          <p role="alert" className="text-xs text-crt-red">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <PixelButton type="submit" tone="phos" disabled={busy}>
            {busy
              ? "Working"
              : mode === "signin"
                ? "Sign in"
                : mode === "signup"
                  ? "Create account"
                  : mode === "reset"
                    ? "Email me a code"
                    : "Set new password"}
          </PixelButton>
          {mode === "signin" && (
            <button
              type="button"
              onClick={() => switchMode("reset")}
              className="text-xs text-muted underline underline-offset-2 hover:text-phos"
            >
              Forgot password?
            </button>
          )}
          {(mode === "reset" || mode === "reset-confirm") && (
            <button
              type="button"
              onClick={() => switchMode("signin")}
              className="text-xs text-muted underline underline-offset-2 hover:text-phos"
            >
              Back to sign in
            </button>
          )}
        </div>

        {mode === "signup" && (
          <p className="text-xs leading-relaxed text-muted">
            Progress already in this browser carries over into the account. Accounts are
            optional; the whole course works without one.
          </p>
        )}
      </form>
    </PixelPanel>
  );
}

/** Six-digit email verification step after sign-up. */
export function ConfirmCodePanel() {
  const { busy, error, pendingEmail, confirmCode, resendCode } = useAuth();
  const [code, setCode] = useState("");
  const [resent, setResent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await confirmCode(code);
  }

  return (
    <PixelPanel tone="amber" title="▪ Check your email" titleAs="h2">
      <form onSubmit={onSubmit} className="flex flex-col gap-4 p-5" noValidate>
        <HudLabel tone="amber">Verification needed</HudLabel>
        <p className="text-sm leading-relaxed text-fg">
          We sent a verification code to{" "}
          <span className="font-mono text-amber">{pendingEmail}</span>. Enter it below to
          activate the account.
        </p>
        <PixelField label="Verification code" htmlFor="acct-code">
          <PixelInput
            id="acct-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </PixelField>
        {error && (
          <p role="alert" className="text-xs text-crt-red">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <PixelButton type="submit" tone="amber" disabled={busy || code.trim().length === 0}>
            {busy ? "Working" : "Verify"}
          </PixelButton>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              await resendCode();
              setResent(true);
            }}
            className="text-xs text-muted underline underline-offset-2 hover:text-phos"
          >
            {resent ? "Code sent again" : "Resend code"}
          </button>
        </div>
      </form>
    </PixelPanel>
  );
}
