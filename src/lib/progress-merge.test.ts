import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS, ALL_CHALLENGES } from "@/challenges";
import { blobsEqual, mergeProgress, type ProgressBlob } from "./progress-merge";

const SLUG_A = ALL_CHALLENGES[0].id;
const SLUG_B = ALL_CHALLENGES[1].id;
const SLUG_C = ALL_CHALLENGES[2].id;
const ACH_A = ACHIEVEMENTS[0].id;
const ACH_B = ACHIEVEMENTS[1].id;

const EARLY = "2026-01-01T10:00:00.000Z";
const LATE = "2026-02-01T10:00:00.000Z";

function blob(partial: Partial<ProgressBlob> = {}): ProgressBlob {
  return { completed: {}, hintsUsed: {}, achievements: [], ...partial };
}

describe("mergeProgress", () => {
  it("unions completed and keeps the earliest date per slug, either order", () => {
    const local = blob({ completed: { [SLUG_A]: LATE, [SLUG_B]: EARLY } });
    const remote = blob({ completed: { [SLUG_A]: EARLY, [SLUG_C]: LATE } });
    for (const merged of [mergeProgress(local, remote), mergeProgress(remote, local)]) {
      expect(merged.completed).toEqual({
        [SLUG_A]: EARLY,
        [SLUG_B]: EARLY,
        [SLUG_C]: LATE,
      });
    }
  });

  it("takes the max hints per slug and drops zero/garbage counts", () => {
    const local = blob({ hintsUsed: { [SLUG_A]: 1, [SLUG_B]: 3 } });
    const remote = blob({
      hintsUsed: { [SLUG_A]: 2, [SLUG_B]: -5, [SLUG_C]: 0 },
    });
    const merged = mergeProgress(local, remote);
    expect(merged.hintsUsed).toEqual({ [SLUG_A]: 2, [SLUG_B]: 3 });
  });

  it("unions achievements, local order first, no duplicates", () => {
    const merged = mergeProgress(
      blob({ achievements: [ACH_B] }),
      blob({ achievements: [ACH_A, ACH_B] }),
    );
    expect(merged.achievements).toEqual([ACH_B, ACH_A]);
  });

  it("whitelists unknown slugs and achievements away", () => {
    const merged = mergeProgress(
      blob({
        completed: { "retired-mission": EARLY, [SLUG_A]: EARLY },
        hintsUsed: { "retired-mission": 2 },
        achievements: ["fake-badge", ACH_A],
      }),
      blob(),
    );
    expect(merged.completed).toEqual({ [SLUG_A]: EARLY });
    expect(merged.hintsUsed).toEqual({});
    expect(merged.achievements).toEqual([ACH_A]);
  });

  it("lets a valid date win over an invalid one, and drops doubly-invalid keys", () => {
    const merged = mergeProgress(
      blob({ completed: { [SLUG_A]: "not-a-date", [SLUG_B]: "garbage" } }),
      blob({ completed: { [SLUG_A]: EARLY, [SLUG_B]: "also-garbage" } }),
    );
    expect(merged.completed).toEqual({ [SLUG_A]: EARLY });
  });

  it("is idempotent and never loses local progress (monotone)", () => {
    const local = blob({
      completed: { [SLUG_A]: LATE },
      hintsUsed: { [SLUG_A]: 2 },
      achievements: [ACH_A],
    });
    const remote = blob({
      completed: { [SLUG_A]: EARLY, [SLUG_B]: LATE },
      achievements: [ACH_B],
    });
    const once = mergeProgress(local, remote);
    const twice = mergeProgress(once, remote);
    expect(blobsEqual(once, twice)).toBe(true);
    // every locally completed slug survives
    for (const slug of Object.keys(local.completed)) {
      expect(once.completed[slug]).toBeDefined();
    }
    expect(once.achievements).toEqual(expect.arrayContaining(local.achievements));
    expect(once.hintsUsed[SLUG_A]).toBeGreaterThanOrEqual(local.hintsUsed[SLUG_A]);
  });

  it("adopts remote progress wholesale onto an empty local blob", () => {
    const remote = blob({
      completed: { [SLUG_A]: EARLY },
      hintsUsed: { [SLUG_A]: 1 },
      achievements: [ACH_A],
    });
    const merged = mergeProgress(blob(), remote);
    expect(blobsEqual(merged, remote)).toBe(true);
  });

  it("treats an empty remote as a no-op", () => {
    const local = blob({
      completed: { [SLUG_A]: EARLY, [SLUG_B]: LATE },
      hintsUsed: { [SLUG_B]: 1 },
      achievements: [ACH_A],
    });
    expect(blobsEqual(mergeProgress(local, blob()), local)).toBe(true);
  });

  it("is commutative on the completed/hints keysets", () => {
    const a = blob({
      completed: { [SLUG_A]: EARLY, [SLUG_C]: LATE },
      hintsUsed: { [SLUG_A]: 4 },
      achievements: [ACH_A],
    });
    const b = blob({
      completed: { [SLUG_B]: EARLY, [SLUG_C]: EARLY },
      hintsUsed: { [SLUG_A]: 1, [SLUG_B]: 2 },
      achievements: [ACH_B, ACH_A],
    });
    const ab = mergeProgress(a, b);
    const ba = mergeProgress(b, a);
    expect(ab.completed).toEqual(ba.completed);
    expect(ab.hintsUsed).toEqual(ba.hintsUsed);
    expect([...ab.achievements].sort()).toEqual([...ba.achievements].sort());
  });
});
