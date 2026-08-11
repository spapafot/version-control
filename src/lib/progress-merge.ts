import { ACHIEVEMENTS, ALL_CHALLENGES } from "@/challenges";

/**
 * The progress fields that sync to the backend (settings never leave the
 * device). Shape mirrors the persisted slice of `useProgress`.
 */
export interface ProgressBlob {
  /** slug → ISO first-completion date */
  completed: Record<string, string>;
  /** slug → max hints revealed */
  hintsUsed: Record<string, number>;
  achievements: string[];
}

const KNOWN_SLUGS = new Set(ALL_CHALLENGES.map((c) => c.id));
const KNOWN_ACHIEVEMENTS = new Set(ACHIEVEMENTS.map((a) => a.id));

function validDate(iso: unknown): iso is string {
  return typeof iso === "string" && Number.isFinite(Date.parse(iso));
}

/**
 * Conflict-free join of two progress blobs.
 *
 * INVARIANT: localStorage is never replaced, only additively merged. Every
 * field is a monotone join: a sync can add completed slugs, move a completion
 * date earlier, raise a hint count, or add achievements. It can never remove,
 * blank, or overwrite local progress, and signing out or a server failure
 * leaves local state exactly as it was. The function is idempotent and
 * commutative, so replays and out-of-order syncs converge.
 *
 * Rules per field:
 * - completed: key union (whitelisted against the course's challenge ids);
 *   per key the earliest valid ISO date wins ("first completion wins", the
 *   same semantics `markCompleted` has locally). An invalid date loses to a
 *   valid one; two invalid dates drop the key.
 * - hintsUsed: key union (whitelisted); per key the max, floored at 0.
 * - achievements: union (whitelisted), local order first.
 */
export function mergeProgress(local: ProgressBlob, remote: ProgressBlob): ProgressBlob {
  const completed: Record<string, string> = {};
  for (const slug of new Set([...Object.keys(local.completed), ...Object.keys(remote.completed)])) {
    if (!KNOWN_SLUGS.has(slug)) continue;
    const a = local.completed[slug];
    const b = remote.completed[slug];
    const aOk = validDate(a);
    const bOk = validDate(b);
    if (aOk && bOk) completed[slug] = Date.parse(a) <= Date.parse(b) ? a : b;
    else if (aOk) completed[slug] = a;
    else if (bOk) completed[slug] = b;
  }

  const hintsUsed: Record<string, number> = {};
  for (const slug of new Set([...Object.keys(local.hintsUsed), ...Object.keys(remote.hintsUsed)])) {
    if (!KNOWN_SLUGS.has(slug)) continue;
    const max = Math.max(toCount(local.hintsUsed[slug]), toCount(remote.hintsUsed[slug]));
    if (max > 0) hintsUsed[slug] = max;
  }

  const achievements = [...local.achievements, ...remote.achievements].filter(
    (id, i, all) => KNOWN_ACHIEVEMENTS.has(id) && all.indexOf(id) === i,
  );

  return { completed, hintsUsed, achievements };
}

function toCount(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

/** The synced slice of a progress state, for building sync payloads. */
export function toBlob(state: {
  completed: Record<string, string>;
  hintsUsed: Record<string, number>;
  achievements: string[];
}): ProgressBlob {
  return {
    completed: state.completed,
    hintsUsed: state.hintsUsed,
    achievements: state.achievements,
  };
}

export function blobsEqual(a: ProgressBlob, b: ProgressBlob): boolean {
  const keysA = Object.keys(a.completed);
  const keysB = Object.keys(b.completed);
  if (keysA.length !== keysB.length) return false;
  if (keysA.some((k) => a.completed[k] !== b.completed[k])) return false;
  const hintsA = Object.keys(a.hintsUsed);
  const hintsB = Object.keys(b.hintsUsed);
  if (hintsA.length !== hintsB.length) return false;
  if (hintsA.some((k) => a.hintsUsed[k] !== b.hintsUsed[k])) return false;
  if (a.achievements.length !== b.achievements.length) return false;
  return a.achievements.every((id, i) => b.achievements[i] === id);
}
