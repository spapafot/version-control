"use client";

import { useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import { getIdTokenIfSignedIn } from "@/lib/auth";
import { HudLabel, PixelButton, PixelField, PixelInput } from "@/components/ui/pixel";
import { setNickname } from "@/lib/quiz-api";

/**
 * Asked once, before a signed-in player's first run.
 *
 * Separate from the display name on the account page on purpose: that one is
 * printed on the certificate and is usually a real name, which nobody signed up
 * to publish next to a score.
 */
export function NicknamePrompt({ onSaved }: { onSaved(nickname: string): void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = value.trim().replace(/\s+/g, " ");
    if (!trimmed) {
      setError("Pick something to be known by.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const token = await getIdTokenIfSignedIn();
      if (token === null) {
        setError("Your session has expired. Sign in again.");
        return;
      }
      await setNickname(trimmed, token);
      onSaved(trimmed);
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "invalid_nickname"
          ? "Use 2 to 24 characters, with at least one letter or number."
          : "That could not be saved. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div>
        <HudLabel tone="amber" className="mb-1 block">
          One thing first
        </HudLabel>
        <p className="text-xs text-muted">
          Scores go on a public board, so pick a name to appear under. This is not
          the name on your certificate, and you can change it on your account page.
        </p>
      </div>
      <PixelField
        label="Nickname"
        htmlFor="quiz-nickname"
        error={error}
        hint="2 to 24 characters."
      >
        <PixelInput
          id="quiz-nickname"
          value={value}
          maxLength={24}
          autoComplete="nickname"
          placeholder="git-goblin"
          onChange={(e) => setValue(e.target.value)}
          aria-describedby={error ? "quiz-nickname-error" : "quiz-nickname-hint"}
        />
      </PixelField>
      <div>
        <PixelButton tone="phos" type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save and play"}
        </PixelButton>
      </div>
    </form>
  );
}
